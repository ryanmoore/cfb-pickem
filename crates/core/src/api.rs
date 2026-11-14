//! The API, shared by every adapter so the two cannot answer differently.
//!
//! Reads are public. Writes need a signed-in, known player; result recording
//! needs an admin. Other players' picks stay hidden until the season locks.
//!
//! Adapters resolve who the caller is (a verified email, or nobody), supply the
//! clock, and write the [`Reply`] out; everything between is here.
//!
//! - `GET /api/me`
//! - `GET /api/seasons`
//! - `GET /api/seasons/{year}/standings`
//! - `GET /api/seasons/{year}/games`
//! - `GET /api/seasons/{year}/picks`
//! - `PUT /api/seasons/{year}/picks`: replace the caller's whole set
//! - `POST /api/seasons/{year}/games/{id}/result`: admin only

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::model::{
    email_hash, GameId, GameResult, GameSlot, Pick, ResultSource, Season, SlotId, SlotSource, User, UserId,
};
use crate::scoring::{rank_ties, standings, validate_confidence_permutation};
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

/// What an adapter knows about a request.
pub struct Request<'a> {
    pub method: &'a str,
    pub path: &'a str,
    /// An address the adapter has already verified.
    pub identity: Option<&'a str>,
    pub content_type: Option<&'a str>,
    pub origin: Option<&'a str>,
    /// The authority the request was sent to (`host[:port]`).
    pub host: Option<&'a str>,
    pub body: &'a [u8],
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

#[derive(Serialize)]
struct SlotView<'a> {
    id: SlotId,
    team: Option<TeamView<'a>>,
    winner_of: Option<GameId>,
    seed: Option<u16>,
}

#[derive(Serialize)]
struct TeamView<'a> {
    name: &'a str,
    rank: Option<u32>,
    record: Option<&'a str>,
}

#[derive(Serialize)]
struct GameView<'a> {
    id: GameId,
    name: &'a str,
    kickoff_at: DateTime<Utc>,
    fixed_wager: Option<u32>,
    slots: Vec<SlotView<'a>>,
    winner_slot_id: Option<SlotId>,
}

#[derive(Serialize)]
struct PlayerPicks<'a> {
    display_name: &'a str,
    is_me: bool,
    picks: Vec<PickView>,
}

/// One pick as it is submitted and as it is shown.
#[derive(Serialize, Deserialize)]
struct PickView {
    game_id: GameId,
    slot_id: SlotId,
    confidence: Option<u32>,
}

#[derive(Deserialize)]
struct PicksBody {
    picks: Vec<PickView>,
}

#[derive(Deserialize)]
struct ResultBody {
    winner_slot_id: SlotId,
}

/// Ways a submitted entry can be wrong besides the confidence rule.
#[derive(Serialize)]
#[serde(rename_all = "snake_case", tag = "problem")]
enum EntryProblem {
    UnknownGame { game_id: GameId },
    DuplicateGame { game_id: GameId },
    SlotNotInGame { game_id: GameId, slot_id: SlotId },
}

fn is_json(content_type: Option<&str>) -> bool {
    content_type
        .and_then(|t| t.split(';').next())
        .is_some_and(|t| t.trim().eq_ignore_ascii_case("application/json"))
}

/// Writes ride on the Access cookie, which a browser attaches to cross-site
/// requests. Requiring JSON forces a CORS preflight, which this API never
/// grants; a present `Origin` must also name this host.
fn csrf_guard(req: &Request) -> Option<Reply> {
    if let Some(origin) = req.origin {
        let authority = origin.split_once("://").map(|(_, a)| a);
        if authority.is_none() || authority != req.host {
            return Some(Reply::error(403, "cross-origin request"));
        }
    }
    (!is_json(req.content_type)).then(|| Reply::error(415, "content type must be application/json"))
}

/// Answer a request. `email_key` is the secret email digests are keyed with.
pub async fn route<S: Storage>(
    storage: &S,
    req: &Request<'_>,
    email_key: &[u8],
    now: DateTime<Utc>,
) -> Result<Reply, S::Error> {
    if req.method != "GET" {
        if let Some(reply) = csrf_guard(req) {
            return Ok(reply);
        }
    }
    let segments: Vec<&str> = req.path.trim_matches('/').split('/').collect();
    let (identity, key) = (req.identity, email_key);
    match (req.method, segments.as_slice()) {
        ("GET", ["api", "me"]) => me(storage, identity, key).await,
        ("GET", ["api", "seasons"]) => seasons(storage, now).await,
        ("GET", ["api", "seasons", year, "standings"]) => standings_reply(storage, year).await,
        ("GET", ["api", "seasons", year, "games"]) => games(storage, year).await,
        ("GET", ["api", "seasons", year, "picks"]) => picks(storage, year, identity, key, now).await,
        ("PUT", ["api", "seasons", year, "picks"]) => put_picks(storage, year, req, key, now).await,
        ("POST", ["api", "seasons", year, "games", id, "result"]) => {
            record_result(storage, year, id, req, key).await
        }
        (_, ["api", "me" | "seasons"] | ["api", "seasons", _, "standings" | "games" | "picks"])
        | (_, ["api", "seasons", _, "games", _, "result"]) => Ok(Reply::error(405, "method not allowed")),
        _ => Ok(Reply::error(404, "not found")),
    }
}

async fn caller<S: Storage>(
    storage: &S,
    identity: Option<&str>,
    email_key: &[u8],
) -> Result<Option<User>, S::Error> {
    match identity {
        Some(email) => storage.user_by_email_hash(&email_hash(email_key, email)).await,
        None => Ok(None),
    }
}

/// The signed-in, known player, or the reply that turns the caller away.
async fn require_user<S: Storage>(
    storage: &S,
    identity: Option<&str>,
    email_key: &[u8],
) -> Result<Result<User, Reply>, S::Error> {
    Ok(match (identity, caller(storage, identity, email_key).await?) {
        (None, _) => Err(Reply::error(401, "sign in required")),
        (Some(_), None) => Err(Reply::error(403, "not a player in this pool")),
        (Some(_), Some(user)) => Ok(user),
    })
}

async fn season_by_year<S: Storage>(storage: &S, year: &str) -> Result<Option<Season>, S::Error> {
    match year.parse() {
        Ok(y) => storage.season_by_year(y).await,
        Err(_) => Ok(None),
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
    let Some(season) = season_by_year(storage, year).await? else {
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
    let user = caller(storage, identity, email_key).await?;
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

async fn games<S: Storage>(storage: &S, year: &str) -> Result<Reply, S::Error> {
    let Some(season) = season_by_year(storage, year).await? else {
        return Ok(Reply::error(404, "no such season"));
    };
    let mut games = storage.games_for_season(season.id).await?;
    games.sort_by_key(|g| (g.kickoff_at, g.id));
    let slots = storage.slots_for_season(season.id).await?;
    let teams = storage.team_seasons_for_season(season.id).await?;
    let events = storage.events().await?;
    let results = storage.results_for_season(season.id).await?;

    let event_names: HashMap<_, _> = events.iter().map(|e| (e.id, e.name.as_str())).collect();
    let winners: HashMap<_, _> = results.iter().map(|r| (r.game_id, r.winner_slot_id)).collect();
    let views: Vec<GameView> = games
        .iter()
        .map(|g| {
            let mut game_slots: Vec<&GameSlot> = slots.iter().filter(|s| s.game_id == g.id).collect();
            game_slots.sort_by_key(|s| s.slot_index);
            GameView {
                id: g.id,
                name: g.display_name.as_deref().or(event_names.get(&g.event_id).copied()).unwrap_or(""),
                kickoff_at: g.kickoff_at,
                fixed_wager: g.fixed_wager,
                slots: game_slots
                    .into_iter()
                    .map(|s| SlotView {
                        id: s.id,
                        team: match &s.source {
                            SlotSource::Team { team_season_id } => {
                                teams.iter().find(|t| t.id == *team_season_id).map(|t| TeamView {
                                    name: &t.name,
                                    rank: t.rank,
                                    record: t.record.as_deref(),
                                })
                            }
                            SlotSource::WinnerOf { .. } => None,
                        },
                        winner_of: match s.source {
                            SlotSource::WinnerOf { game_id } => Some(game_id),
                            SlotSource::Team { .. } => None,
                        },
                        seed: s.seed,
                    })
                    .collect(),
                winner_slot_id: winners.get(&g.id).copied(),
            }
        })
        .collect();
    Ok(Reply::json(200, &serde_json::json!({ "year": season.year, "games": views })))
}

async fn picks<S: Storage>(
    storage: &S,
    year: &str,
    identity: Option<&str>,
    email_key: &[u8],
    now: DateTime<Utc>,
) -> Result<Reply, S::Error> {
    let Some(season) = season_by_year(storage, year).await? else {
        return Ok(Reply::error(404, "no such season"));
    };
    let me = caller(storage, identity, email_key).await?.map(|u| u.id);
    let locked = now >= season.locks_at;
    let all = storage.picks_for_season(season.id).await?;
    let users = storage.users().await?;
    let mut players: Vec<PlayerPicks> = Vec::new();
    for user in &users {
        let is_me = me == Some(user.id);
        if !locked && !is_me {
            continue;
        }
        let picks: Vec<PickView> = all
            .iter()
            .filter(|p| p.user_id == user.id)
            .map(|p| PickView { game_id: p.game_id, slot_id: p.slot_id, confidence: p.confidence })
            .collect();
        if !picks.is_empty() {
            players.push(PlayerPicks { display_name: &user.display_name, is_me, picks });
        }
    }
    players.sort_by(|a, b| a.display_name.cmp(b.display_name));
    Ok(Reply::json(
        200,
        &serde_json::json!({ "year": season.year, "locked": locked, "players": players }),
    ))
}

async fn put_picks<S: Storage>(
    storage: &S,
    year: &str,
    req: &Request<'_>,
    email_key: &[u8],
    now: DateTime<Utc>,
) -> Result<Reply, S::Error> {
    let user = match require_user(storage, req.identity, email_key).await? {
        Ok(user) => user,
        Err(reply) => return Ok(reply),
    };
    let Some(season) = season_by_year(storage, year).await? else {
        return Ok(Reply::error(404, "no such season"));
    };
    if now >= season.locks_at {
        return Ok(Reply::error(409, "picks are locked"));
    }
    let Ok(body) = serde_json::from_slice::<PicksBody>(req.body) else {
        return Ok(Reply::error(400, "body must be {\"picks\": [{game_id, slot_id, confidence}]}"));
    };

    let games = storage.games_for_season(season.id).await?;
    let slots = storage.slots_for_season(season.id).await?;
    let known: HashSet<GameId> = games.iter().map(|g| g.id).collect();
    let mut seen = HashSet::new();
    let mut problems = Vec::new();
    let mut picks = Vec::new();
    for p in &body.picks {
        if !known.contains(&p.game_id) {
            problems.push(serde_json::json!(EntryProblem::UnknownGame { game_id: p.game_id }));
        } else if !seen.insert(p.game_id) {
            problems.push(serde_json::json!(EntryProblem::DuplicateGame { game_id: p.game_id }));
        } else {
            if !slots.iter().any(|s| s.id == p.slot_id && s.game_id == p.game_id) {
                problems.push(serde_json::json!(EntryProblem::SlotNotInGame {
                    game_id: p.game_id,
                    slot_id: p.slot_id
                }));
            }
            picks.push(Pick {
                user_id: user.id,
                game_id: p.game_id,
                season_id: season.id,
                slot_id: p.slot_id,
                confidence: p.confidence,
            });
        }
    }
    if let Err(errors) = validate_confidence_permutation(&games, &picks) {
        problems.extend(errors.iter().map(|e| serde_json::json!(e)));
    }
    if !problems.is_empty() {
        return Ok(Reply::json(422, &serde_json::json!({ "error": "invalid picks", "problems": problems })));
    }
    let generation = storage.replace_picks(user.id, season.id, &picks).await?;
    Ok(Reply::json(200, &serde_json::json!({ "generation": generation })))
}

async fn record_result<S: Storage>(
    storage: &S,
    year: &str,
    game_id: &str,
    req: &Request<'_>,
    email_key: &[u8],
) -> Result<Reply, S::Error> {
    let user = match require_user(storage, req.identity, email_key).await? {
        Ok(user) => user,
        Err(reply) => return Ok(reply),
    };
    if !user.is_admin {
        return Ok(Reply::error(403, "admin only"));
    }
    let Some(season) = season_by_year(storage, year).await? else {
        return Ok(Reply::error(404, "no such season"));
    };
    let game_id = GameId(game_id.parse().unwrap_or(-1));
    let games = storage.games_for_season(season.id).await?;
    if !games.iter().any(|g| g.id == game_id) {
        return Ok(Reply::error(404, "no such game in this season"));
    }
    let Ok(body) = serde_json::from_slice::<ResultBody>(req.body) else {
        return Ok(Reply::error(400, "body must be {\"winner_slot_id\": id}"));
    };
    let slots = storage.slots_for_season(season.id).await?;
    if !slots.iter().any(|s| s.id == body.winner_slot_id && s.game_id == game_id) {
        return Ok(Reply::error(422, "winner_slot_id is not a slot of this game"));
    }
    let result = GameResult { game_id, winner_slot_id: body.winner_slot_id, source: ResultSource::Manual };
    let generation = storage.record_result(result).await?;
    Ok(Reply::json(200, &serde_json::json!({ "generation": generation })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;
    use pollster::block_on;
    use std::cell::{Cell, RefCell};

    const KEY: &[u8] = b"test-key";
    const NOW: &str = "2023-12-21T00:00:00Z";

    /// Two seasons over the same two games: 2023 is open, 2022 is locked.
    /// Game 1 is slots 10/11, game 2 is slots 20/21.
    struct Fake {
        users: Vec<User>,
        picks: RefCell<Vec<Pick>>,
        results: RefCell<Vec<GameResult>>,
        generation: Cell<u64>,
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
            display_name: (id == 2).then(|| "Renamed Bowl".into()),
            kickoff_at: format!("2023-12-2{}T00:00:00Z", 3 - id).parse().unwrap(),
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

    fn fake(users: Vec<User>, picks: Vec<Pick>, results: Vec<GameResult>) -> Fake {
        Fake {
            users,
            picks: RefCell::new(picks),
            results: RefCell::new(results),
            generation: Cell::new(1),
        }
    }

    impl Storage for Fake {
        type Error = ();
        async fn seasons(&self) -> Result<Vec<Season>, ()> {
            let at = |y: u16, locks: &str| Season {
                id: SeasonId(y as i64 - 2022),
                year: y,
                locks_at: locks.parse().unwrap(),
                generation: self.generation.get(),
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
        async fn slots_for_season(&self, _: SeasonId) -> Result<Vec<GameSlot>, ()> {
            let slot = |id: i64, game_id: i64, slot_index: u8, source: SlotSource| GameSlot {
                id: SlotId(id),
                game_id: GameId(game_id),
                slot_index,
                source,
                seed: None,
            };
            let team = |t: i64| SlotSource::Team { team_season_id: TeamSeasonId(t) };
            Ok(vec![
                slot(21, 2, 1, SlotSource::WinnerOf { game_id: GameId(1) }),
                slot(10, 1, 0, team(1)),
                slot(11, 1, 1, team(2)),
                slot(20, 2, 0, team(1)),
            ])
        }
        async fn team_seasons_for_season(&self, _: SeasonId) -> Result<Vec<TeamSeason>, ()> {
            let ts = |id: i64, name: &str| TeamSeason {
                id: TeamSeasonId(id),
                name: name.into(),
                rank: (id == 1).then_some(3),
                record: Some("10-2".into()),
            };
            Ok(vec![ts(1, "Alpha"), ts(2, "Beta")])
        }
        async fn events(&self) -> Result<Vec<Event>, ()> {
            Ok(vec![Event { id: EventId(1), name: "First Bowl".into() }])
        }
        async fn results_for_season(&self, _: SeasonId) -> Result<Vec<GameResult>, ()> {
            Ok(self.results.borrow().clone())
        }
        async fn picks_for_season(&self, _: SeasonId) -> Result<Vec<Pick>, ()> {
            Ok(self.picks.borrow().clone())
        }
        async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>, ()> {
            Ok(self.users.iter().find(|u| u.email_hash.as_ref() == Some(hash)).cloned())
        }
        async fn users(&self) -> Result<Vec<User>, ()> {
            Ok(self.users.clone())
        }
        async fn replace_picks(&self, user: UserId, _: SeasonId, picks: &[Pick]) -> Result<u64, ()> {
            let mut all = self.picks.borrow_mut();
            all.retain(|p| p.user_id != user);
            all.extend_from_slice(picks);
            self.generation.set(self.generation.get() + 1);
            Ok(self.generation.get())
        }
        async fn record_result(&self, result: GameResult) -> Result<u64, ()> {
            let mut all = self.results.borrow_mut();
            all.retain(|r| r.game_id != result.game_id);
            all.push(result);
            self.generation.set(self.generation.get() + 1);
            Ok(self.generation.get())
        }
    }

    fn send(fake: &Fake, method: &str, path: &str, identity: Option<&str>, body: &str) -> (u16, serde_json::Value) {
        let req = Request {
            method,
            path,
            identity,
            content_type: Some("application/json"),
            origin: None,
            host: Some("pool.test"),
            body: body.as_bytes(),
        };
        let r = block_on(route(fake, &req, KEY, NOW.parse().unwrap())).unwrap();
        (r.status, serde_json::from_str(&r.body).unwrap())
    }

    fn get(fake: &Fake, path: &str, identity: Option<&str>) -> (u16, serde_json::Value) {
        send(fake, "GET", path, identity, "")
    }

    const ANN: &str = "ann@example.com";
    const BO: &str = "bo@example.com";

    fn pool() -> Fake {
        fake(
            vec![
                user(1, "Ann", Some(ANN), true),
                user(2, "Bo", Some(BO), false),
            ],
            vec![pick(2, 1, 10, 1), pick(2, 2, 20, 2)],
            vec![],
        )
    }

    #[test]
    fn standings_rank_ties_and_order() {
        // Game 1 won by slot 10, game 2 undecided. Ann and Bo tie on both
        // numbers; Cy has fewer points banked; Di banked the same as Ann/Bo
        // but can still reach more.
        let fake = fake(
            vec![
                user(1, "Bo", None, false),
                user(2, "Ann", None, false),
                user(3, "Cy", None, false),
                user(4, "Di", None, false),
            ],
            vec![
                pick(1, 1, 10, 1), pick(1, 2, 20, 2),
                pick(2, 1, 10, 1), pick(2, 2, 20, 2),
                pick(3, 1, 11, 2), pick(3, 2, 20, 1),
                pick(4, 1, 10, 1), pick(4, 2, 20, 5),
            ],
            vec![GameResult { game_id: GameId(1), winner_slot_id: SlotId(10), source: ResultSource::Manual }],
        );
        let (status, body) = get(&fake, "/api/seasons/2023/standings", None);
        assert_eq!(status, 200);
        let rows: Vec<(u64, String, u64, u64, u64)> = body["standings"]
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
        let (_, body) = get(&pool(), "/api/seasons", None);
        assert_eq!(body, serde_json::json!({"seasons": [{"year": 2023, "locked": false}, {"year": 2022, "locked": true}]}));
    }

    #[test]
    fn me_cases_and_unknown_paths() {
        let fake = pool();
        for (identity, expected) in [
            (None, r#"{"signed_in":false}"#),
            (Some("stranger@example.com"), r#"{"signed_in":true,"known":false}"#),
            (Some(" ANN@example.com"), r#"{"signed_in":true,"known":true,"display_name":"Ann","is_admin":true}"#),
        ] {
            assert_eq!(get(&fake, "/api/me", identity), (200, serde_json::from_str(expected).unwrap()));
        }
        assert_eq!(get(&fake, "/api/nope", None).0, 404);
        assert_eq!(send(&fake, "POST", "/api/me", None, "{}").0, 405);
    }

    #[test]
    fn games_come_in_kickoff_order_with_slots_resolved() {
        let (status, body) = get(&pool(), "/api/seasons/2023/games", None);
        assert_eq!(status, 200);
        // Game 2 kicks off first; its own display name wins over the event's.
        let games = body["games"].as_array().unwrap();
        assert_eq!(games.iter().map(|g| g["id"].as_i64().unwrap()).collect::<Vec<_>>(), [2, 1]);
        assert_eq!(games[0]["name"], "Renamed Bowl");
        assert_eq!(games[1]["name"], "First Bowl");
        // Slots in slot_index order: a team, or a feeder game.
        assert_eq!(games[0]["slots"][0]["team"], serde_json::json!({"name": "Alpha", "rank": 3, "record": "10-2"}));
        assert_eq!(games[0]["slots"][1]["winner_of"], 1);
        assert!(games[0]["slots"][1]["team"].is_null());
        assert!(games[0]["winner_slot_id"].is_null());
    }

    #[test]
    fn other_players_picks_stay_hidden_until_the_season_locks() {
        let fake = pool();
        let names = |body: &serde_json::Value| {
            body["players"].as_array().unwrap().iter().map(|p| p["display_name"].as_str().unwrap().to_string()).collect::<Vec<_>>()
        };
        // Open season: Bo sees only Bo, Ann (no picks) and anonymous see nothing.
        assert_eq!(names(&get(&fake, "/api/seasons/2023/picks", Some(BO)).1), ["Bo"]);
        assert!(names(&get(&fake, "/api/seasons/2023/picks", Some(ANN)).1).is_empty());
        assert!(names(&get(&fake, "/api/seasons/2023/picks", None).1).is_empty());
        // Locked season: everyone's picks are public, including to anonymous.
        let (_, body) = get(&fake, "/api/seasons/2022/picks", None);
        assert_eq!(names(&body), ["Bo"]);
        assert_eq!(body["locked"], true);
        assert_eq!(body["players"][0]["picks"][0], serde_json::json!({"game_id": 1, "slot_id": 10, "confidence": 1}));
    }

    #[test]
    fn writes_need_a_known_player_and_results_an_admin() {
        let fake = pool();
        let entry = r#"{"picks":[{"game_id":1,"slot_id":11,"confidence":2},{"game_id":2,"slot_id":20,"confidence":1}]}"#;
        let result = r#"{"winner_slot_id":10}"#;
        let picks = "/api/seasons/2023/picks";
        let game1 = "/api/seasons/2023/games/1/result";
        assert_eq!(send(&fake, "PUT", picks, None, entry).0, 401);
        assert_eq!(send(&fake, "PUT", picks, Some("stranger@example.com"), entry).0, 403);
        assert_eq!(send(&fake, "POST", game1, None, result).0, 401);
        assert_eq!(send(&fake, "POST", game1, Some(BO), result).0, 403);
        assert!(fake.results.borrow().is_empty());

        assert_eq!(send(&fake, "PUT", picks, Some(BO), entry), (200, serde_json::json!({"generation": 2})));
        assert_eq!(fake.picks.borrow()[0], pick(2, 1, 11, 2));
        assert_eq!(send(&fake, "POST", game1, Some(ANN), result).0, 200);
        // An admin can fix a mistake by recording again.
        assert_eq!(send(&fake, "POST", game1, Some(ANN), r#"{"winner_slot_id":11}"#).0, 200);
        assert_eq!(fake.results.borrow().len(), 1);
        assert_eq!(fake.results.borrow()[0].source, ResultSource::Manual);
    }

    #[test]
    fn recorded_results_move_the_standings() {
        let fake = pool();
        send(&fake, "POST", "/api/seasons/2023/games/1/result", Some(ANN), r#"{"winner_slot_id":10}"#);
        let (_, body) = get(&fake, "/api/seasons/2023/standings", None);
        assert_eq!(body["standings"][0]["scored"], 1);
        assert_eq!(body["standings"][0]["max_possible"], 3);
        let (_, body) = get(&fake, "/api/seasons/2023/games", None);
        assert_eq!(body["games"][1]["winner_slot_id"], 10);
    }

    #[test]
    fn a_locked_season_refuses_new_picks() {
        let fake = pool();
        let entry = r#"{"picks":[]}"#;
        assert_eq!(send(&fake, "PUT", "/api/seasons/2022/picks", Some(BO), entry).0, 409);
        assert_eq!(fake.picks.borrow().len(), 2);
    }

    #[test]
    fn invalid_entries_get_the_whole_problem_list() {
        let fake = pool();
        let put = |body: &str| send(&fake, "PUT", "/api/seasons/2023/picks", Some(BO), body);
        let problems = |body: &str| {
            let (status, reply) = put(body);
            assert_eq!(status, 422, "{reply}");
            reply["problems"].as_array().unwrap().iter().map(|p| p["problem"].as_str().unwrap().to_string()).collect::<Vec<_>>()
        };
        // Slot 20 belongs to game 2, and game 3 is not in the season.
        assert_eq!(
            problems(r#"{"picks":[{"game_id":1,"slot_id":20,"confidence":1},{"game_id":2,"slot_id":20,"confidence":2},{"game_id":3,"slot_id":1,"confidence":3}]}"#),
            ["slot_not_in_game", "unknown_game"]
        );
        // Duplicate confidence, reported with the value left unused, and a repeated game.
        assert_eq!(
            problems(r#"{"picks":[{"game_id":1,"slot_id":10,"confidence":1},{"game_id":2,"slot_id":20,"confidence":1},{"game_id":2,"slot_id":21,"confidence":2}]}"#),
            ["duplicate_game", "duplicate", "unused"]
        );
        assert_eq!(problems(r#"{"picks":[{"game_id":1,"slot_id":10,"confidence":1}]}"#), ["missing_pick", "unused"]);
        assert_eq!(put("not json").0, 400);
        assert_eq!(fake.picks.borrow().len(), 2, "rejected entries change nothing");
    }

    #[test]
    fn cross_site_writes_are_refused() {
        let fake = pool();
        let attempt = |content_type, origin| {
            let req = Request {
                method: "POST",
                path: "/api/seasons/2023/games/1/result",
                identity: Some(ANN),
                content_type,
                origin,
                host: Some("pool.test"),
                body: br#"{"winner_slot_id":10}"#,
            };
            block_on(route(&fake, &req, KEY, NOW.parse().unwrap())).unwrap().status
        };
        let json = Some("application/json; charset=utf-8");
        assert_eq!(attempt(Some("text/plain"), None), 415);
        assert_eq!(attempt(None, None), 415);
        assert_eq!(attempt(json, Some("https://evil.test")), 403);
        assert_eq!(attempt(json, Some("null")), 403);
        assert_eq!(attempt(json, Some("https://pool.test")), 200);
        assert_eq!(attempt(json, None), 200);
    }
}
