//! The read API, shared by every adapter so the two cannot answer differently.
//!
//! Adapters resolve who the caller is (a verified email, or nobody), supply the
//! clock, and write the [`Reply`] out; everything between is here.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::model::{email_hash, User, UserId};
use crate::scoring::{rank_ties, standings};
use crate::storage::Storage;

pub struct Reply {
    pub status: u16,
    pub body: String,
}

impl Reply {
    fn json(status: u16, body: &impl Serialize) -> Self {
        Self { status, body: serde_json::to_string(body).expect("response types serialise") }
    }

    pub fn error(status: u16, message: &str) -> Self {
        Self::json(status, &serde_json::json!({ "error": message }))
    }
}

#[derive(Serialize)]
struct SeasonSummary {
    year: u16,
    locked: bool,
}

#[derive(Serialize)]
struct StandingRow<'a> {
    rank: u32,
    display_name: &'a str,
    scored: u32,
    remaining: u32,
    max_possible: u32,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Me<'a> {
    Anonymous { signed_in: bool },
    Unknown { signed_in: bool, known: bool },
    Player { signed_in: bool, known: bool, display_name: &'a str, is_admin: bool },
}

/// Answer a request. `identity` is an address the adapter has already
/// verified; `email_key` is the secret its digest is keyed with.
pub async fn route<S: Storage>(
    storage: &S,
    method: &str,
    path: &str,
    identity: Option<&str>,
    email_key: &[u8],
    now: DateTime<Utc>,
) -> Result<Reply, S::Error> {
    if method != "GET" {
        return Ok(Reply::error(405, "method not allowed"));
    }
    let segments: Vec<&str> = path.trim_matches('/').split('/').collect();
    match (method, segments.as_slice()) {
        ("GET", ["api", "seasons"]) => seasons(storage, now).await,
        ("GET", ["api", "seasons", year, "standings"]) => standings_reply(storage, year).await,
        ("GET", ["api", "me"]) => me(storage, identity, email_key).await,
        _ => Ok(Reply::error(404, "not found")),
    }
}

async fn seasons<S: Storage>(storage: &S, now: DateTime<Utc>) -> Result<Reply, S::Error> {
    let mut seasons = storage.seasons().await?;
    seasons.sort_by_key(|s| std::cmp::Reverse(s.year));
    let seasons: Vec<_> = seasons
        .iter()
        .map(|s| SeasonSummary { year: s.year, locked: now >= s.locks_at })
        .collect();
    Ok(Reply::json(200, &serde_json::json!({ "seasons": seasons })))
}

async fn standings_reply<S: Storage>(storage: &S, year: &str) -> Result<Reply, S::Error> {
    let season = match year.parse() {
        Ok(y) => storage.season_by_year(y).await?,
        Err(_) => None,
    };
    let Some(season) = season else {
        return Ok(Reply::error(404, "no such season"));
    };
    let games = storage.games_for_season(season.id).await?;
    let picks = storage.picks_for_season(season.id).await?;
    let results = storage.results_for_season(season.id).await?;
    let users = storage.users().await?;
    let names: HashMap<UserId, &str> = users.iter().map(|u| (u.id, u.display_name.as_str())).collect();
    let mut rows: Vec<_> = standings(&games, &picks, &results)
        .into_iter()
        .filter_map(|s| Some((names.get(&s.user_id)?, s)))
        .collect();
    rows.sort_by(|(an, a), (bn, b)| {
        b.scored.cmp(&a.scored).then(b.max_possible().cmp(&a.max_possible())).then(an.cmp(bn))
    });
    let points: Vec<_> = rows.iter().map(|(_, s)| (s.scored, s.max_possible())).collect();
    let ranked: Vec<_> = rank_ties(&points)
        .into_iter()
        .zip(&rows)
        .map(|(rank, (name, s))| StandingRow {
            rank,
            display_name: name,
            scored: s.scored,
            remaining: s.remaining,
            max_possible: s.max_possible(),
        })
        .collect();
    Ok(Reply::json(200, &serde_json::json!({ "year": season.year, "standings": ranked })))
}

async fn me<S: Storage>(
    storage: &S,
    identity: Option<&str>,
    email_key: &[u8],
) -> Result<Reply, S::Error> {
    let user: Option<User> = match identity {
        Some(email) => storage.user_by_email_hash(&email_hash(email_key, email)).await?,
        None => None,
    };
    Ok(Reply::json(
        200,
        &match (identity, &user) {
            (None, _) => Me::Anonymous { signed_in: false },
            (Some(_), None) => Me::Unknown { signed_in: true, known: false },
            (Some(_), Some(u)) => Me::Player {
                signed_in: true,
                known: true,
                display_name: &u.display_name,
                is_admin: u.is_admin,
            },
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;
    use pollster::block_on;

    const KEY: &[u8] = b"test-key";

    struct Fake {
        users: Vec<User>,
        picks: Vec<Pick>,
        results: Vec<GameResult>,
    }

    fn user(id: i64, name: &str, email: Option<&str>, is_admin: bool) -> User {
        User {
            id: UserId(id),
            email_hash: email.map(|e| email_hash(KEY, e)),
            display_name: name.into(),
            is_admin,
        }
    }

    fn game(id: i64) -> Game {
        Game {
            id: GameId(id),
            season_id: SeasonId(1),
            event_id: EventId(id),
            display_name: None,
            kickoff_at: "2023-12-20T00:00:00Z".parse().unwrap(),
            fixed_wager: None,
        }
    }

    fn pick(user: i64, game: i64, slot: i64, confidence: u32) -> Pick {
        Pick {
            user_id: UserId(user),
            game_id: GameId(game),
            season_id: SeasonId(1),
            slot_id: SlotId(slot),
            confidence: Some(confidence),
        }
    }

    impl Storage for Fake {
        type Error = ();
        async fn seasons(&self) -> Result<Vec<Season>, ()> {
            let at = |y: u16, locks: &str| Season {
                id: SeasonId(y as i64 - 2022),
                year: y,
                locks_at: locks.parse().unwrap(),
                generation: 1,
            };
            Ok(vec![at(2022, "2022-12-01T00:00:00Z"), at(2023, "2024-01-01T00:00:00Z")])
        }
        async fn season_by_year(&self, year: u16) -> Result<Option<Season>, ()> {
            Ok(self.seasons().await?.into_iter().find(|s| s.year == year).map(|mut s| {
                s.id = SeasonId(1);
                s
            }))
        }
        async fn games_for_season(&self, _: SeasonId) -> Result<Vec<Game>, ()> {
            Ok(vec![game(1), game(2)])
        }
        async fn results_for_season(&self, _: SeasonId) -> Result<Vec<GameResult>, ()> {
            Ok(self.results.clone())
        }
        async fn picks_for_season(&self, _: SeasonId) -> Result<Vec<Pick>, ()> {
            Ok(self.picks.clone())
        }
        async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>, ()> {
            Ok(self.users.iter().find(|u| u.email_hash.as_ref() == Some(hash)).cloned())
        }
        async fn users(&self) -> Result<Vec<User>, ()> {
            Ok(self.users.clone())
        }
        async fn slots_for_season(&self, _: SeasonId) -> Result<Vec<GameSlot>, ()> {
            unimplemented!()
        }
        async fn replace_picks(&self, _: UserId, _: SeasonId, _: &[Pick]) -> Result<u64, ()> {
            unimplemented!()
        }
        async fn record_result(&self, _: GameResult) -> Result<u64, ()> {
            unimplemented!()
        }
    }

    fn get(fake: &Fake, path: &str, identity: Option<&str>) -> (u16, String) {
        let now = "2023-12-21T00:00:00Z".parse().unwrap();
        let r = block_on(route(fake, "GET", path, identity, KEY, now)).unwrap();
        (r.status, r.body)
    }

    #[test]
    fn standings_rank_ties_and_order() {
        // Game 1 won by slot 10, game 2 undecided. Ann and Bo tie on both
        // numbers; Cy has fewer points banked; Di banked the same as Ann/Bo
        // but can still reach more.
        let fake = Fake {
            users: vec![
                user(1, "Bo", None, false),
                user(2, "Ann", None, false),
                user(3, "Cy", None, false),
                user(4, "Di", None, false),
            ],
            picks: vec![
                pick(1, 1, 10, 1), pick(1, 2, 20, 2),
                pick(2, 1, 10, 1), pick(2, 2, 20, 2),
                pick(3, 1, 11, 2), pick(3, 2, 20, 1),
                pick(4, 1, 10, 1), pick(4, 2, 20, 5),
            ],
            results: vec![GameResult {
                game_id: GameId(1),
                winner_slot_id: SlotId(10),
                source: ResultSource::Manual,
            }],
        };
        let (status, body) = get(&fake, "/api/seasons/2023/standings", None);
        assert_eq!(status, 200);
        let rows: Vec<(u64, String, u64, u64, u64)> = serde_json::from_str::<serde_json::Value>(&body).unwrap()
            ["standings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| {
                let n = |k: &str| r[k].as_u64().unwrap();
                (n("rank"), r["display_name"].as_str().unwrap().into(), n("scored"), n("remaining"), n("max_possible"))
            })
            .collect();
        assert_eq!(
            rows,
            [
                (1, "Di".into(), 1, 5, 6),
                (2, "Ann".into(), 1, 2, 3),
                (2, "Bo".into(), 1, 2, 3),
                (4, "Cy".into(), 0, 1, 1),
            ]
        );
        assert_eq!(get(&fake, "/api/seasons/1999/standings", None).0, 404);
        assert_eq!(get(&fake, "/api/seasons/x/standings", None).0, 404);
    }

    #[test]
    fn seasons_newest_first_with_lock_state() {
        let fake = Fake { users: vec![], picks: vec![], results: vec![] };
        let (_, body) = get(&fake, "/api/seasons", None);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({"seasons": [{"year": 2023, "locked": false}, {"year": 2022, "locked": true}]})
        );
    }

    #[test]
    fn me_cases_and_unknown_paths() {
        let fake = Fake {
            users: vec![user(1, "Ann", Some("ann@example.com"), true)],
            picks: vec![],
            results: vec![],
        };
        for (identity, expected) in [
            (None, r#"{"signed_in":false}"#),
            (Some("stranger@example.com"), r#"{"signed_in":true,"known":false}"#),
            (
                Some(" ANN@example.com"),
                r#"{"signed_in":true,"known":true,"display_name":"Ann","is_admin":true}"#,
            ),
        ] {
            assert_eq!(get(&fake, "/api/me", identity), (200, expected.into()));
        }
        assert_eq!(get(&fake, "/api/nope", None).0, 404);
        let post = block_on(route(&fake, "POST", "/api/me", None, KEY, "2023-12-21T00:00:00Z".parse().unwrap())).unwrap();
        assert_eq!(post.status, 405);
    }
}
