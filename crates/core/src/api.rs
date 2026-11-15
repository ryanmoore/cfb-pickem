//! The API, shared by every adapter so the two cannot answer differently.
//!
//! Reads are public. Writes need a signed-in, known player; result recording
//! needs an admin. Other players' picks stay hidden until the season locks.
//!
//! Adapters resolve who the caller is (a verified email, or nobody), supply the
//! clock, and write the [`Reply`] out; everything between is here.

use std::collections::{BTreeSet, HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::bracket::Bracket;
use crate::history::{self, Finish, Place};
use crate::model::{
    email_hash, Game, GameId, GameResult, GameSlot, Pick, PlayoffFormat, PlayoffRank, PlayoffSave, ResultSource, Season, SeasonId,
    SlotId, SlotSource, TeamSeasonId, User, UserId,
};
use crate::scoring::{playoff_units, rank_ties, standings, validate_confidence_permutation, validate_ranking};
use crate::storage::{Archive, Storage};

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
    locks_at: DateTime<Utc>,
    practice: bool,
}

#[derive(Serialize)]
struct StandingRow<'a> {
    rank: u32,
    display_name: &'a str,
    bowls: f64,
    playoff: f64,
    total: f64,
    remaining: f64,
    remaining_bowls: f64,
    remaining_playoff: f64,
    max_possible: f64,
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
    team_season_id: Option<TeamSeasonId>,
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
    name: String,
    kickoff_at: DateTime<Utc>,
    fixed_wager: Option<u32>,
    slots: Vec<SlotView<'a>>,
    winner_slot_id: Option<SlotId>,
    /// Bracket games only: how many games precede it, and who won it.
    #[serde(skip_serializing_if = "Option::is_none")]
    round: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    winner: Option<TeamSeasonId>,
}

/// A playoff team and its run through the bracket.
#[derive(Serialize)]
struct BracketTeam<'a> {
    team_season_id: TeamSeasonId,
    name: &'a str,
    rank: Option<u32>,
    record: Option<&'a str>,
    seed: Option<u16>,
    max_wins: u32,
    wins: u32,
    eliminated: bool,
}

#[derive(Serialize)]
struct PlayerPicks<'a> {
    display_name: &'a str,
    is_me: bool,
    picks: Vec<PickView>,
    playoff: Vec<RankView>,
}

/// One team of a playoff ranking as it is submitted and as it is shown.
#[derive(Serialize, Deserialize)]
struct RankView {
    team_season_id: TeamSeasonId,
    rank: u32,
}

/// One pick as it is submitted and as it is shown.
#[derive(Serialize, Deserialize)]
struct PickView {
    game_id: GameId,
    slot_id: Option<SlotId>,
    confidence: Option<u32>,
}

#[derive(Deserialize)]
struct PicksBody {
    picks: Vec<PickView>,
    /// A complete ranking of the playoff teams, for a season that ranks them.
    #[serde(default)]
    playoff: Vec<RankView>,
    /// Whether the player has confirmed that ranking ("I'm done").
    #[serde(default)]
    playoff_done: bool,
    /// The version the entry was based on: absent for an unconditional save,
    /// null for "I had no picks yet".
    #[serde(default, deserialize_with = "Option::deserialize")]
    base_version: Option<Option<String>>,
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

fn problem(p: impl Serialize) -> serde_json::Value {
    serde_json::to_value(p).expect("response types serialise")
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
        ("GET", ["api", "history"]) => history_reply(storage, now).await,
        ("GET", ["api", "seasons", year, "standings"]) => standings_reply(storage, year, now).await,
        ("GET", ["api", "seasons", year, "games"]) => games(storage, year).await,
        ("GET", ["api", "seasons", year, "picks"]) => picks(storage, year, identity, key, now).await,
        ("GET", ["api", "seasons", year, "progress"]) => progress(storage, year).await,
        ("PUT", ["api", "seasons", year, "picks"]) => put_picks(storage, year, req, key, now).await,
        ("POST", ["api", "seasons", year, "games", id, "result"]) => {
            record_result(storage, year, id, req, key).await
        }
        (_, ["api", "me" | "seasons" | "history"] | ["api", "seasons", _, "standings" | "games" | "picks" | "progress"])
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
        .map(|s| SeasonSummary { year: s.year, locked: now >= s.locks_at, locks_at: s.locks_at, practice: s.practice })
        .collect();
    Ok(Reply::json(200, &serde_json::json!({ "seasons": seasons })))
}

async fn standings_reply<S: Storage>(storage: &S, year: &str, now: DateTime<Utc>) -> Result<Reply, S::Error> {
    let Some(season) = season_by_year(storage, year).await? else {
        return Ok(Reply::error(404, "no such season"));
    };
    let data = Archive {
        games: storage.games_for_season(season.id).await?,
        slots: storage.slots_for_season(season.id).await?,
        results: storage.results_for_season(season.id).await?,
        picks: storage.picks_for_season(season.id).await?,
        ranks: storage.playoff_ranks_for_season(season.id).await?,
    };
    let users = storage.users().await?;
    let ranked = ranked_standings(&season, now >= season.locks_at, &data, &users);
    Ok(Reply::json(
        200,
        &serde_json::json!({
            "year": season.year,
            "playoff_ranked": season.playoff_format == PlayoffFormat::Rank,
            "standings": ranked,
        }),
    ))
}

/// A season's standings, leader first.
fn ranked_standings<'a>(season: &Season, locked: bool, data: &Archive, users: &'a [User]) -> Vec<StandingRow<'a>> {
    let (bracket_games, bowls) = split_games(season, data.games.clone());
    let (picks, results) = (&data.picks, &data.results);
    let runs = Bracket::new(&bracket_games.iter().map(|g| g.id).collect::<Vec<_>>(), &data.slots, results).runs();
    // Playoff points are counted in units of 1/n, so ties compare exactly.
    let n = runs.len().max(1) as u32;
    let bowl_standings = standings(&bowls, picks, results);
    // Per player: bowl points, bowl points left, playoff units, playoff units left.
    let mut rows: Vec<(&str, [u32; 4])> = users
        .iter()
        .filter_map(|u| {
            let bowl = bowl_standings.iter().find(|s| s.user_id == u.id);
            // Rankings count only once locked: any playoff figure before then would
            // show how the player weighed the bye teams.
            let mine: Vec<PlayoffRank> = if locked {
                data.ranks.iter().filter(|r| r.user_id == u.id).copied().collect()
            } else {
                Vec::new()
            };
            if bowl.is_none() && mine.is_empty() {
                return None;
            }
            let (units, units_left) = playoff_units(&mine, &runs);
            let (scored, left) = bowl.map_or((0, 0), |s| (s.scored, s.remaining));
            Some((u.display_name.as_str(), [scored, left, units, units_left]))
        })
        .collect();
    let totals = |[scored, left, units, units_left]: [u32; 4]| {
        let total = scored * n + units;
        (total, total + left * n + units_left)
    };
    rows.sort_by(|(an, a), (bn, b)| {
        let ((at, am), (bt, bm)) = (totals(*a), totals(*b));
        bt.cmp(&at).then(bm.cmp(&am)).then(an.cmp(bn))
    });
    let ties: Vec<_> = rows.iter().map(|(_, r)| totals(*r)).collect();
    rank_ties(&ties)
        .into_iter()
        .zip(&rows)
        .map(|(rank, (name, r))| {
            let (total, max) = totals(*r);
            let of = |units: u32| f64::from(units) / f64::from(n);
            StandingRow {
                rank,
                display_name: name,
                bowls: f64::from(r[0]),
                playoff: of(r[2]),
                total: of(total),
                remaining: of(max - total),
                remaining_bowls: f64::from(r[1]),
                remaining_playoff: of(r[3]),
                max_possible: of(max),
            }
        })
        .collect()
}

/// The archive cut into one [`Archive`] per season. A ranking names no season
/// of its own, so it goes with the season whose bracket holds its team.
fn by_season(all: Archive) -> HashMap<SeasonId, Archive> {
    let empty = || Archive { games: vec![], slots: vec![], results: vec![], picks: vec![], ranks: vec![] };
    let mut out: HashMap<SeasonId, Archive> = HashMap::new();
    let game_season: HashMap<GameId, SeasonId> = all.games.iter().map(|g| (g.id, g.season_id)).collect();
    let mut team_season: HashMap<TeamSeasonId, SeasonId> = HashMap::new();
    for g in all.games {
        out.entry(g.season_id).or_insert_with(empty).games.push(g);
    }
    for s in all.slots {
        if let SlotSource::Team { team_season_id } = s.source {
            team_season.insert(team_season_id, game_season[&s.game_id]);
        }
        out.entry(game_season[&s.game_id]).or_insert_with(empty).slots.push(s);
    }
    for r in all.results {
        out.entry(game_season[&r.game_id]).or_insert_with(empty).results.push(r);
    }
    for p in all.picks {
        out.entry(p.season_id).or_insert_with(empty).picks.push(p);
    }
    for r in all.ranks {
        out.entry(team_season[&r.team_season_id]).or_insert_with(empty).ranks.push(r);
    }
    out
}

/// Final standings of every locked, non-practice season whose games all have
/// results, as all-time stats. Computed per request: it reads a fixed number
/// of rows and costs a few milliseconds.
async fn history_reply<S: Storage>(storage: &S, now: DateTime<Utc>) -> Result<Reply, S::Error> {
    let mut seasons = storage.seasons().await?;
    seasons.retain(|s| !s.practice && now >= s.locks_at);
    let users = storage.users().await?;
    let mut data = by_season(storage.archive().await?);
    let standings: Vec<_> = seasons
        .iter()
        .filter_map(|s| Some((s, data.remove(&s.id)?)))
        .filter(|(_, d)| !d.games.is_empty() && d.games.iter().all(|g| d.results.iter().any(|r| r.game_id == g.id)))
        .map(|(s, d)| (s.year, ranked_standings(s, true, &d, &users)))
        .collect();
    let finishes: Vec<_> = standings
        .iter()
        .map(|(year, rows)| Finish {
            year: *year,
            places: rows.iter().map(|r| Place { name: r.display_name, rank: r.rank, total: r.total }).collect(),
        })
        .collect();
    Ok(Reply::json(200, &history::history(&finishes)))
}

/// A season that ranks its playoff teams takes no picks on the bracket's
/// games: they are scored through the rankings alone. Returns the bracket's
/// games and the games players pick winners for.
fn split_games(season: &Season, games: Vec<Game>) -> (Vec<Game>, Vec<Game>) {
    if season.playoff_format == PlayoffFormat::Rank {
        games.into_iter().partition(|g| g.playoff)
    } else {
        (Vec::new(), games)
    }
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
    let (bracket_games, games) = split_games(&season, games);
    let slots = storage.slots_for_season(season.id).await?;
    let teams = storage.team_seasons_for_season(season.id).await?;
    let events = storage.events().await?;
    let results = storage.results_for_season(season.id).await?;

    let event_names: HashMap<_, _> = events.iter().map(|e| (e.id, e.name.as_str())).collect();
    let winners: HashMap<_, _> = results.iter().map(|r| (r.game_id, r.winner_slot_id)).collect();
    let view = |g: &Game| {
        let mut game_slots: Vec<&GameSlot> = slots.iter().filter(|s| s.game_id == g.id).collect();
        game_slots.sort_by_key(|s| s.slot_index);
        GameView {
            id: g.id,
            name: g.display_name.as_deref().or(event_names.get(&g.event_id).copied()).unwrap_or("").into(),
            kickoff_at: g.kickoff_at,
            fixed_wager: g.fixed_wager,
            slots: game_slots
                .into_iter()
                .map(|s| {
                    let team_season_id = match s.source {
                        SlotSource::Team { team_season_id } => Some(team_season_id),
                        SlotSource::WinnerOf { .. } => None,
                    };
                    SlotView {
                        id: s.id,
                        team_season_id,
                        team: team_season_id.and_then(|id| teams.iter().find(|t| t.id == id)).map(|t| TeamView {
                            name: &t.name,
                            rank: t.rank,
                            record: t.record.as_deref(),
                        }),
                        winner_of: match s.source {
                            SlotSource::WinnerOf { game_id } => Some(game_id),
                            SlotSource::Team { .. } => None,
                        },
                        seed: s.seed,
                    }
                })
                .collect(),
            winner_slot_id: winners.get(&g.id).copied(),
            round: None,
            winner: None,
        }
    };
    let mut reply = serde_json::json!({
        "year": season.year,
        "games": games.iter().map(view).collect::<Vec<_>>(),
    });
    if season.playoff_format == PlayoffFormat::Rank {
        let bracket = Bracket::new(&bracket_games.iter().map(|g| g.id).collect::<Vec<_>>(), &slots, &results);
        let playoff_teams: Vec<BracketTeam> = bracket
            .runs()
            .into_iter()
            .filter_map(|run| {
                let t = teams.iter().find(|t| t.id == run.team)?;
                Some(BracketTeam {
                    team_season_id: t.id,
                    name: &t.name,
                    rank: t.rank,
                    record: t.record.as_deref(),
                    seed: run.seed,
                    max_wins: run.max_wins,
                    wins: run.wins,
                    eliminated: run.eliminated,
                })
            })
            .collect();
        let playoff_games: Vec<GameView> = bracket_games
            .iter()
            .map(|g| GameView { round: Some(bracket.round(g.id)), winner: bracket.winner(g.id), ..view(g) })
            .collect();
        reply["playoff"] = serde_json::json!({ "teams": playoff_teams, "games": playoff_games });
    }
    Ok(Reply::json(200, &reply))
}

fn pick_views(all: &[Pick], user: UserId) -> Vec<PickView> {
    all.iter()
        .filter(|p| p.user_id == user)
        .map(|p| PickView { game_id: p.game_id, slot_id: p.slot_id, confidence: p.confidence })
        .collect()
}

fn rank_views(all: &[PlayoffRank], user: UserId) -> Vec<RankView> {
    all.iter()
        .filter(|r| r.user_id == user)
        .map(|r| RankView { team_season_id: r.team_season_id, rank: r.rank })
        .collect()
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
    let all_ranks = storage.playoff_ranks_for_season(season.id).await?;
    let users = storage.users().await?;
    let mut players: Vec<PlayerPicks> = Vec::new();
    for user in &users {
        let is_me = me == Some(user.id);
        if !locked && !is_me {
            continue;
        }
        let picks = pick_views(&all, user.id);
        let playoff = rank_views(&all_ranks, user.id);
        if !picks.is_empty() || !playoff.is_empty() {
            players.push(PlayerPicks { display_name: &user.display_name, is_me, picks, playoff });
        }
    }
    players.sort_by(|a, b| a.display_name.cmp(b.display_name));
    let (version, playoff_done) = match me {
        Some(user) => (storage.picks_version(user, season.id).await?, playoff_done(storage, season.id, user).await?),
        None => (None, false),
    };
    Ok(Reply::json(
        200,
        &serde_json::json!({
            "year": season.year, "locked": locked, "version": version, "playoff_done": playoff_done, "players": players,
        }),
    ))
}

async fn playoff_done<S: Storage>(storage: &S, season: SeasonId, user: UserId) -> Result<bool, S::Error> {
    Ok(storage.playoff_status_for_season(season).await?.iter().any(|s| s.user_id == user && s.done))
}

/// Changes to a ranking after its first save that make a player "started" in
/// the progress view; fewer means they left the auto-shuffled order alone.
const STARTED_MOVES: u32 = 3;

/// How many winners each player has chosen and, in a ranked-playoff season,
/// how far they got with the playoff ranking: `done` once they confirmed a
/// ranking that is complete for the current bracket, `started` after a few
/// changes to it, else `untouched`. Reveals no picks or rankings, so it is public before the lock.
async fn progress<S: Storage>(storage: &S, year: &str) -> Result<Reply, S::Error> {
    let Some(season) = season_by_year(storage, year).await? else {
        return Ok(Reply::error(404, "no such season"));
    };
    let (bracket_games, games) = split_games(&season, storage.games_for_season(season.id).await?);
    let total = games.len();
    let picks = storage.picks_for_season(season.id).await?;
    let ranked = season.playoff_format == PlayoffFormat::Rank;
    let teams: Vec<TeamSeasonId> = if ranked {
        let slots = storage.slots_for_season(season.id).await?;
        let ids: Vec<GameId> = bracket_games.iter().map(|g| g.id).collect();
        Bracket::new(&ids, &slots, &[]).runs().iter().map(|t| t.team).collect()
    } else {
        Vec::new()
    };
    let ranks = storage.playoff_ranks_for_season(season.id).await?;
    let statuses = if ranked { storage.playoff_status_for_season(season.id).await? } else { Vec::new() };
    let mut players: Vec<_> = storage
        .users()
        .await?
        .iter()
        // A player who can sign in, or who played this season; old accounts
        // that can do neither would only add rows of zeros.
        .filter(|u| u.email_hash.is_some() || picks.iter().any(|p| p.user_id == u.id))
        .map(|u| {
            let picked = picks.iter().filter(|p| p.user_id == u.id && p.slot_id.is_some()).count();
            let mut row = serde_json::json!({ "display_name": u.display_name, "picked": picked, "total": total });
            if ranked {
                let mine: Vec<PlayoffRank> = ranks.iter().filter(|r| r.user_id == u.id).copied().collect();
                let status = statuses.iter().find(|s| s.user_id == u.id);
                row["playoff_state"] = if status.is_some_and(|s| s.done) && validate_ranking(&teams, &mine).is_ok() {
                    "done"
                } else if status.is_some_and(|s| s.moves >= STARTED_MOVES) {
                    "started"
                } else {
                    "untouched"
                }
                .into();
            }
            row
        })
        .collect();
    players.sort_by(|a, b| a["display_name"].as_str().cmp(&b["display_name"].as_str()));
    Ok(Reply::json(200, &serde_json::json!({ "year": season.year, "players": players })))
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

    let (bracket_games, games) = split_games(&season, storage.games_for_season(season.id).await?);
    let slots = storage.slots_for_season(season.id).await?;
    let known: HashSet<GameId> = games.iter().map(|g| g.id).collect();
    let mut seen = HashSet::new();
    let mut problems = Vec::new();
    let mut picks = Vec::new();
    for p in &body.picks {
        if !known.contains(&p.game_id) {
            problems.push(problem(EntryProblem::UnknownGame { game_id: p.game_id }));
        } else if !seen.insert(p.game_id) {
            problems.push(problem(EntryProblem::DuplicateGame { game_id: p.game_id }));
        } else {
            if let Some(slot_id) = p.slot_id {
                if !slots.iter().any(|s| s.id == slot_id && s.game_id == p.game_id) {
                    problems.push(problem(EntryProblem::SlotNotInGame { game_id: p.game_id, slot_id }));
                }
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
        problems.extend(errors.into_iter().map(problem));
    }
    let ranks: Vec<PlayoffRank> = body
        .playoff
        .iter()
        .map(|r| PlayoffRank { user_id: user.id, team_season_id: r.team_season_id, rank: r.rank })
        .collect();
    let bracket_ids: Vec<GameId> = bracket_games.iter().map(|g| g.id).collect();
    let teams: Vec<TeamSeasonId> = Bracket::new(&bracket_ids, &slots, &[]).runs().iter().map(|r| r.team).collect();
    if let Err(errors) = validate_ranking(&teams, &ranks) {
        problems.extend(errors.into_iter().map(problem));
    }
    if !problems.is_empty() {
        return Ok(Reply::json(422, &serde_json::json!({ "error": "invalid picks", "problems": problems })));
    }
    let version = now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let base = body.base_version.as_ref().map(|v| v.as_deref().unwrap_or(""));
    // Saves are debounced, so several quick moves arrive as one save: this
    // counts saves that changed the ranking, not individual moves.
    let mine = |all: &[PlayoffRank]| -> BTreeSet<_> {
        all.iter().filter(|r| r.user_id == user.id).map(|r| (r.team_season_id.0, r.rank)).collect()
    };
    let stored = mine(&storage.playoff_ranks_for_season(season.id).await?);
    let changed = !stored.is_empty() && stored != mine(&ranks);
    let playoff = PlayoffSave { done: body.playoff_done && !teams.is_empty(), changed };
    match storage.replace_picks(user.id, season.id, &picks, &ranks, playoff, &version, base).await? {
        Some(generation) => Ok(Reply::json(200, &serde_json::json!({ "generation": generation, "version": version }))),
        None => {
            let all = storage.picks_for_season(season.id).await?;
            let all_ranks = storage.playoff_ranks_for_season(season.id).await?;
            let version = storage.picks_version(user.id, season.id).await?;
            let playoff_done = playoff_done(storage, season.id, user.id).await?;
            Ok(Reply::json(
                412,
                &serde_json::json!({
                    "error": "picks changed since your copy",
                    "version": version,
                    "playoff_done": playoff_done,
                    "picks": pick_views(&all, user.id),
                    "playoff": rank_views(&all_ranks, user.id),
                }),
            ))
        }
    }
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
    let generation = storage.record_result(season.id, result).await?;
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
        ranks: RefCell<Vec<PlayoffRank>>,
        status: RefCell<Vec<PlayoffStatus>>,
        results: RefCell<Vec<GameResult>>,
        format: PlayoffFormat,
        /// Bracket games, their slots and teams, on top of the two bowls.
        bracket: (Vec<Game>, Vec<GameSlot>, Vec<TeamSeason>),
        generation: Cell<u64>,
        versions: RefCell<std::collections::HashMap<i64, String>>,
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
            playoff: false,
        }
    }

    enum Side {
        Team(i64),
        Win(i64),
    }

    /// A bracket of `size` teams (team id = 100 + seed) where seeds 1..=byes
    /// skip the first round; games are 100, 101, ... in round order and a game's slots
    /// are `game * 10` and `game * 10 + 1`.
    fn field(size: usize, byes: usize) -> (Vec<Game>, Vec<GameSlot>, Vec<TeamSeason>) {
        let mut specs: Vec<(i64, [Side; 2])> = Vec::new();
        let mut add = |a: Side, b: Side| {
            let id = 100 + specs.len() as i64;
            specs.push((id, [a, b]));
            id
        };
        let first = (size - byes) / 2;
        let mut pairs: Vec<[Side; 2]> = if first > 0 {
            let winners: Vec<i64> =
                (0..first).map(|k| add(Side::Team((byes + 1 + k) as i64), Side::Team((size - k) as i64))).collect();
            (0..byes).map(|k| [Side::Team(k as i64 + 1), Side::Win(winners[byes - 1 - k])]).collect()
        } else {
            (0..size / 2).map(|k| [Side::Team(k as i64 + 1), Side::Team((size - k) as i64)]).collect()
        };
        loop {
            let ids: Vec<i64> = pairs.into_iter().map(|[a, b]| add(a, b)).collect();
            if ids.len() == 1 {
                break;
            }
            pairs = (0..ids.len() / 2).map(|k| [Side::Win(ids[k]), Side::Win(ids[ids.len() - 1 - k])]).collect();
        }
        let mut games = Vec::new();
        let mut slots = Vec::new();
        for (id, sides) in specs {
            games.push(Game {
                id: GameId(id),
                season_id: SeasonId(1),
                event_id: EventId(id),
                display_name: Some(format!("Playoff {id}")),
                kickoff_at: "2023-12-30T00:00:00Z".parse().unwrap(),
                fixed_wager: None,
                playoff: true,
            });
            for (k, side) in sides.into_iter().enumerate() {
                let (source, seed) = match side {
                    Side::Team(t) => (SlotSource::Team { team_season_id: TeamSeasonId(100 + t) }, Some(t as u16)),
                    Side::Win(g) => (SlotSource::WinnerOf { game_id: GameId(g) }, None),
                };
                slots.push(GameSlot { id: SlotId(id * 10 + k as i64), game_id: GameId(id), slot_index: k as u8, source, seed });
            }
        }
        let teams = (1..=size as i64)
            .map(|seed| TeamSeason { id: TeamSeasonId(100 + seed), name: format!("Team {seed}"), rank: None, record: None })
            .collect();
        (games, slots, teams)
    }

    fn pick(user: i64, game: i64, slot: i64, confidence: u32) -> Pick {
        Pick {
            user_id: UserId(user),
            game_id: GameId(game),
            season_id: SeasonId(1),
            slot_id: Some(SlotId(slot)),
            confidence: Some(confidence),
        }
    }

    fn fake(users: Vec<User>, picks: Vec<Pick>, results: Vec<GameResult>) -> Fake {
        Fake {
            users,
            picks: RefCell::new(picks),
            ranks: RefCell::new(vec![]),
            results: RefCell::new(results),
            format: PlayoffFormat::Fixed,
            bracket: Default::default(),
            generation: Cell::new(1),
            status: RefCell::new(vec![]),
            versions: RefCell::new([(2, "v0".to_string())].into()),
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
                playoff_format: self.format,
                practice: false,
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
            Ok([vec![game(1), game(2)], self.bracket.0.clone()].concat())
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
            let bowls = vec![
                slot(21, 2, 1, SlotSource::WinnerOf { game_id: GameId(1) }),
                slot(10, 1, 0, team(1)),
                slot(11, 1, 1, team(2)),
                slot(20, 2, 0, team(1)),
            ];
            Ok([bowls, self.bracket.1.clone()].concat())
        }
        async fn team_seasons_for_season(&self, _: SeasonId) -> Result<Vec<TeamSeason>, ()> {
            let ts = |id: i64, name: &str| TeamSeason {
                id: TeamSeasonId(id),
                name: name.into(),
                rank: (id == 1).then_some(3),
                record: Some("10-2".into()),
            };
            Ok([vec![ts(1, "Alpha"), ts(2, "Beta")], self.bracket.2.clone()].concat())
        }
        async fn playoff_ranks_for_season(&self, _: SeasonId) -> Result<Vec<PlayoffRank>, ()> {
            Ok(self.ranks.borrow().clone())
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
        async fn archive(&self) -> Result<Archive, ()> {
            let id = SeasonId(1);
            Ok(Archive {
                games: self.games_for_season(id).await?,
                slots: self.slots_for_season(id).await?,
                results: self.results_for_season(id).await?,
                picks: self.picks_for_season(id).await?,
                ranks: self.playoff_ranks_for_season(id).await?,
            })
        }
        async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>, ()> {
            Ok(self.users.iter().find(|u| u.email_hash.as_ref() == Some(hash)).cloned())
        }
        async fn users(&self) -> Result<Vec<User>, ()> {
            Ok(self.users.clone())
        }
        async fn playoff_status_for_season(&self, _: SeasonId) -> Result<Vec<PlayoffStatus>, ()> {
            Ok(self.status.borrow().clone())
        }
        async fn picks_version(&self, user: UserId, _: SeasonId) -> Result<Option<String>, ()> {
            Ok(self.versions.borrow().get(&user.0).cloned())
        }
        async fn replace_picks(
            &self,
            user: UserId,
            _: SeasonId,
            picks: &[Pick],
            ranks: &[PlayoffRank],
            playoff: PlayoffSave,
            version: &str,
            base: Option<&str>,
        ) -> Result<Option<u64>, ()> {
            let mut versions = self.versions.borrow_mut();
            if base.is_some_and(|b| b != versions.get(&user.0).map_or("", String::as_str)) {
                return Ok(None);
            }
            let mut status = self.status.borrow_mut();
            if !status.iter().any(|s| s.user_id == user) {
                status.push(PlayoffStatus { user_id: user, done: false, moves: 0 });
            }
            let mine = status.iter_mut().find(|s| s.user_id == user).unwrap();
            mine.done = playoff.done;
            mine.moves += u32::from(playoff.changed);
            versions.insert(user.0, version.into());
            let mut all = self.picks.borrow_mut();
            all.retain(|p| p.user_id != user);
            all.extend_from_slice(picks);
            let mut all_ranks = self.ranks.borrow_mut();
            all_ranks.retain(|r| r.user_id != user);
            all_ranks.extend_from_slice(ranks);
            self.generation.set(self.generation.get() + 1);
            Ok(Some(self.generation.get()))
        }
        async fn record_result(&self, _: SeasonId, result: GameResult) -> Result<u64, ()> {
            let mut all = self.results.borrow_mut();
            all.retain(|r| r.game_id != result.game_id);
            all.push(result);
            self.generation.set(self.generation.get() + 1);
            Ok(self.generation.get())
        }
    }

    fn send(fake: &Fake, method: &str, path: &str, identity: Option<&str>, body: &str) -> (u16, serde_json::Value) {
        send_at(fake, NOW, method, path, identity, body)
    }

    fn send_at(
        fake: &Fake,
        now: &str,
        method: &str,
        path: &str,
        identity: Option<&str>,
        body: &str,
    ) -> (u16, serde_json::Value) {
        let req = Request {
            method,
            path,
            identity,
            content_type: Some("application/json"),
            origin: None,
            host: Some("pool.test"),
            body: body.as_bytes(),
        };
        let r = block_on(route(fake, &req, KEY, now.parse().unwrap())).unwrap();
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
                let n = |k: &str| r[k].as_f64().unwrap() as u64;
                (n("rank"), r["display_name"].as_str().unwrap().into(), n("total"), n("remaining"), n("max_possible"))
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
        assert_eq!(body, serde_json::json!({"seasons": [{"year": 2023, "locked": false, "locks_at": "2024-01-01T00:00:00Z", "practice": false}, {"year": 2022, "locked": true, "locks_at": "2022-12-01T00:00:00Z", "practice": false}]}));
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

        assert_eq!(send(&fake, "PUT", picks, Some(BO), entry), (200, serde_json::json!({"generation": 2, "version": "2023-12-21T00:00:00.000Z"})));
        assert_eq!(fake.picks.borrow()[0], pick(2, 1, 11, 2));
        assert_eq!(send(&fake, "POST", game1, Some(ANN), result).0, 200);
        // An admin can fix a mistake by recording again.
        assert_eq!(send(&fake, "POST", game1, Some(ANN), r#"{"winner_slot_id":11}"#).0, 200);
        assert_eq!(fake.results.borrow().len(), 1);
        assert_eq!(fake.results.borrow()[0].source, ResultSource::Manual);
        // The result shows in the games list and moves the standings.
        assert_eq!(get(&fake, "/api/seasons/2023/games", None).1["games"][1]["winner_slot_id"], 11);
        assert_eq!(get(&fake, "/api/seasons/2023/standings", None).1["standings"][0]["total"], 2.0);
    }

    #[test]
    fn a_save_based_on_a_stale_version_is_refused_with_the_current_set() {
        let fake = pool();
        let picks = "/api/seasons/2023/picks";
        let entry = |base: &str| {
            format!(r#"{{{base}"picks":[{{"game_id":1,"slot_id":11,"confidence":2}},{{"game_id":2,"slot_id":20,"confidence":1}}]}}"#)
        };
        let (_, body) = get(&fake, picks, Some(BO));
        assert_eq!(body["version"], "v0");
        assert_eq!(get(&fake, picks, Some(ANN)).1["version"], serde_json::Value::Null);

        let (status, body) = send(&fake, "PUT", picks, Some(BO), &entry(r#""base_version":"old","#));
        assert_eq!(status, 412);
        assert_eq!(body["version"], "v0");
        assert_eq!(body["picks"][0], serde_json::json!({"game_id": 1, "slot_id": 10, "confidence": 1}));
        assert_eq!(fake.picks.borrow()[0], pick(2, 1, 10, 1), "a refused save changes nothing");
        // Someone with no picks expects null, not a version.
        assert_eq!(send(&fake, "PUT", picks, Some(ANN), &entry(r#""base_version":"v0","#)).0, 412);

        assert_eq!(send(&fake, "PUT", picks, Some(BO), &entry(r#""base_version":"v0","#)).0, 200);
        assert_eq!(send(&fake, "PUT", picks, Some(ANN), &entry(r#""base_version":null,"#)).0, 200);
        assert_eq!(send(&fake, "PUT", picks, Some(BO), &entry("")).0, 200, "no base is unconditional");
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
    fn unset_winners_save_read_back_score_nothing_and_show_in_progress() {
        let fake = pool();
        let picks = "/api/seasons/2023/picks";
        // Game 1 has no winner chosen yet; every game is still present.
        let entry = r#"{"picks":[{"game_id":1,"slot_id":null,"confidence":2},{"game_id":2,"slot_id":20,"confidence":1}]}"#;
        assert_eq!(send(&fake, "PUT", picks, Some(BO), entry).0, 200);
        let (_, body) = get(&fake, picks, Some(BO));
        assert_eq!(body["players"][0]["picks"][0], serde_json::json!({"game_id": 1, "slot_id": null, "confidence": 2}));

        // Progress is public before the lock and counts only chosen winners.
        let (status, body) = get(&fake, "/api/seasons/2023/progress", None);
        assert_eq!(status, 200);
        assert_eq!(
            body["players"],
            serde_json::json!([
                {"display_name": "Ann", "picked": 0, "total": 2},
                {"display_name": "Bo", "picked": 1, "total": 2},
            ])
        );

        // The unset game scores 0 even once decided, and was never in play.
        send(&fake, "POST", "/api/seasons/2023/games/1/result", Some(ANN), r#"{"winner_slot_id":10}"#);
        let after = get(&fake, "/api/seasons/2023/standings", None).1["standings"][0].clone();
        assert_eq!((after["total"].clone(), after["max_possible"].clone()), (0.0.into(), 1.0.into()));
        assert_eq!(get(&fake, "/api/seasons/1999/progress", None).0, 404);
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

    /// Both seasons rank a playoff of `size` teams over the two bowls.
    fn rank_pool(size: usize, byes: usize) -> Fake {
        Fake { format: PlayoffFormat::Rank, bracket: field(size, byes), ..pool() }
    }

    const PUT_PICKS: &str = "/api/seasons/2023/picks";

    fn entry(playoff: &str) -> String {
        format!(
            r#"{{"picks":[{{"game_id":1,"slot_id":10,"confidence":1}},{{"game_id":2,"slot_id":20,"confidence":2}}],"playoff":[{playoff}]}}"#
        )
    }

    /// Team `100 + seed` ranked `size + 1 - seed`: the best seed is the most confident.
    fn by_seed(size: usize) -> Vec<String> {
        (1..=size).map(|s| format!(r#"{{"team_season_id":{},"rank":{}}}"#, 100 + s, size + 1 - s)).collect()
    }

    fn win(fake: &Fake, game: i64, slot: i64) {
        let path = format!("/api/seasons/2023/games/{game}/result");
        assert_eq!(send(fake, "POST", &path, Some(ANN), &format!(r#"{{"winner_slot_id":{slot}}}"#)).0, 200);
    }

    /// After the 2023 season's lock, when rankings count.
    const LOCKED: &str = "2024-01-02T00:00:00Z";

    fn bo_standing(fake: &Fake) -> Vec<f64> {
        let (_, body) = send_at(fake, LOCKED, "GET", "/api/seasons/2023/standings", None, "");
        let row = &body["standings"][0];
        assert_eq!(row["display_name"], "Bo");
        ["bowls", "playoff", "total", "remaining", "max_possible", "remaining_bowls", "remaining_playoff"].map(|k| row[k].as_f64().unwrap()).into()
    }

    #[test]
    fn playoff_teams_score_rank_times_wins_and_the_bracket_says_what_is_left() {
        let fake = rank_pool(12, 4);
        assert_eq!(send(&fake, "PUT", PUT_PICKS, Some(BO), &entry(&by_seed(12).join(","))).0, 200);
        // Ranks 12..1 by seed: seeds 1-4 can win 3 games, the rest 4, besides the bowls' 1 + 2.
        assert_eq!(bo_standing(&fake), [0.0, 0.0, 0.0, 273.0, 273.0, 3.0, 270.0]);

        // Seed 5 beats 12, 9 beats 8, 1 beats 9, 5 beats 4, then 1 beats 5.
        for (game, slot) in [(100, 1000), (103, 1031), (104, 1040), (107, 1071), (108, 1080)] {
            win(&fake, game, slot);
        }
        // Seed 1 won twice at rank 12, seed 5 twice at rank 8, seed 9 once at rank 4. Seeds
        // 1, 2, 3, 6, 7, 10 and 11 are alive; the bowls' 3 points are still open.
        assert_eq!(bo_standing(&fake), [0.0, 44.0, 44.0, 150.0, 194.0, 3.0, 147.0]);

        let (_, body) = get(&fake, "/api/seasons/2023/games", None);
        assert_eq!(body["games"].as_array().unwrap().len(), 2, "bracket games are not pick games");
        let playoff = &body["playoff"];
        let run = |seed: usize| {
            let t = &playoff["teams"][seed - 1];
            (t["seed"].as_u64().unwrap(), t["max_wins"].as_u64().unwrap(), t["wins"].as_u64().unwrap(), t["eliminated"].as_bool().unwrap())
        };
        assert_eq!([run(1), run(5), run(9), run(12)], [(1, 3, 2, false), (5, 4, 2, true), (9, 4, 1, true), (12, 4, 0, true)]);
        let rounds: Vec<u64> = playoff["games"].as_array().unwrap().iter().map(|g| g["round"].as_u64().unwrap()).collect();
        assert_eq!(rounds, [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3]);
        let semi = &playoff["games"][8];
        assert_eq!((semi["winner"].clone(), semi["slots"][0]["winner_of"].clone()), (101.into(), 104.into()));
    }

    #[test]
    fn playoff_points_weigh_the_same_at_any_field_size() {
        // (size, byes, wins for the best seed, wins for the first seed to play)
        for (size, byes, top, first) in [(12, 4, 3, 4), (24, 8, 4, 5)] {
            let fake = rank_pool(size, byes);
            assert_eq!(send(&fake, "PUT", PUT_PICKS, Some(BO), &entry(&by_seed(size).join(","))).0, 200);
            let (_, body) = get(&fake, "/api/seasons/2023/games", None);
            let teams = &body["playoff"]["teams"];
            assert_eq!(teams.as_array().unwrap().len(), size);
            assert_eq!((teams[0]["max_wins"].clone(), teams[byes]["max_wins"].clone()), (top.into(), first.into()));

            // The first seed to play wins its opener, at rank size - byes, scaled by 12/size.
            win(&fake, 100, 1000);
            let [bowls, playoff, total, ..] = bo_standing(&fake)[..] else { unreachable!() };
            assert_eq!((bowls, playoff, total), (0.0, 8.0, 8.0), "{size} teams");
        }
    }

    #[test]
    fn a_ranking_must_be_a_complete_permutation_of_the_playoff_teams() {
        let fake = rank_pool(12, 4);
        let with_last = |last: &str| {
            let mut all = by_seed(12);
            *all.last_mut().unwrap() = last.to_string();
            all.join(",")
        };
        let mut missing = by_seed(12);
        missing.pop();
        for (case, playoff, expected) in [
            ("one team missing", missing.join(","), vec!["missing_team"]),
            ("no ranking", String::new(), vec!["missing_team"; 12]),
            ("a team twice", with_last(r#"{"team_season_id":101,"rank":1}"#), vec!["duplicate_team", "missing_team"]),
            ("a team outside the bracket", with_last(r#"{"team_season_id":1,"rank":1}"#), vec!["unknown_team", "missing_team"]),
            ("rank above N", with_last(r#"{"team_season_id":112,"rank":13}"#), vec!["bad_rank"]),
            ("rank zero", with_last(r#"{"team_season_id":112,"rank":0}"#), vec!["bad_rank"]),
            ("a rank used twice", with_last(r#"{"team_season_id":112,"rank":2}"#), vec!["bad_rank"]),
        ] {
            let (status, reply) = send(&fake, "PUT", PUT_PICKS, Some(BO), &entry(&playoff));
            assert_eq!(status, 422, "{case}: {reply}");
            let problems: Vec<_> = reply["problems"].as_array().unwrap().iter().map(|p| p["problem"].as_str().unwrap()).collect();
            assert_eq!(problems, expected, "{case}");
        }
        // A bracket game takes no pick of its own.
        let body = r#"{"picks":[{"game_id":1,"slot_id":10,"confidence":1},{"game_id":2,"slot_id":20,"confidence":2},{"game_id":100,"slot_id":1000,"confidence":3}],"playoff":[]}"#;
        let (status, reply) = send(&fake, "PUT", PUT_PICKS, Some(BO), body);
        assert_eq!((status, reply["problems"][0]["problem"].clone()), (422, "unknown_game".into()));
        assert!(fake.ranks.borrow().is_empty(), "rejected entries change nothing");

        // A season that does not rank its playoff has no teams to rank.
        let (status, reply) = send(&pool(), "PUT", PUT_PICKS, Some(BO), &entry(r#"{"team_season_id":1,"rank":1}"#));
        assert_eq!((status, reply["problems"][0]["problem"].clone()), (422, "unknown_team".into()));
    }

    #[test]
    fn rankings_are_hidden_until_the_lock_and_save_under_the_version_check() {
        let fake = rank_pool(12, 4);
        let ranks = by_seed(12).join(",");
        let ranking = |who, path| get(&fake, path, who).1["players"][0]["playoff"].as_array().map(Vec::len);
        let (status, saved) = send(&fake, "PUT", PUT_PICKS, Some(BO), &entry(&ranks));
        assert_eq!(status, 200, "{saved}");
        assert_eq!(fake.ranks.borrow().len(), 12);
        // Open season: only Bo sees them. Locked: everyone does, signed in or not.
        assert_eq!((ranking(Some(BO), PUT_PICKS), ranking(Some(ANN), PUT_PICKS), ranking(None, PUT_PICKS)), (Some(12), None, None));
        assert_eq!(ranking(None, "/api/seasons/2022/picks"), Some(12));

        // A save from a stale copy is refused and answered with the current ranking.
        let stale = entry(&ranks).replace(r#""playoff""#, r#""base_version":"old","playoff""#);
        let (status, reply) = send(&fake, "PUT", PUT_PICKS, Some(BO), &stale);
        assert_eq!((status, reply["playoff"].as_array().map(Vec::len)), (412, Some(12)));

        // Once locked, a ranking is refused and the saved one stands.
        let swapped = by_seed(12).into_iter().rev().collect::<Vec<_>>().join(",");
        assert_eq!(send(&fake, "PUT", "/api/seasons/2022/picks", Some(BO), &entry(&swapped)).0, 409);
        assert_eq!(fake.ranks.borrow().iter().find(|r| r.team_season_id == TeamSeasonId(101)).unwrap().rank, 12);
    }

    #[test]
    fn standings_before_the_lock_do_not_depend_on_rankings() {
        let fake = rank_pool(12, 4);
        let ann = Some(ANN);
        let before = |fake: &Fake| get(fake, "/api/seasons/2023/standings", None).1["standings"].clone();
        assert_eq!(send(&fake, "PUT", PUT_PICKS, Some(BO), &entry(&by_seed(12).join(","))).0, 200);
        let reversed = (1..=12).map(|s| format!(r#"{{"team_season_id":{},"rank":{s}}}"#, 100 + s)).collect::<Vec<_>>().join(",");
        assert_eq!(send(&fake, "PUT", PUT_PICKS, ann, &entry(&reversed)).0, 200);
        let rows = before(&fake);
        let field = |row: usize, k: &str| rows[row][k].as_f64().unwrap();
        assert_eq!(rows.as_array().unwrap().len(), 2);
        assert_eq!(field(0, "remaining_playoff"), 0.0);
        for k in ["playoff", "total", "remaining", "remaining_playoff", "max_possible"] {
            assert_eq!(field(0, k), field(1, k), "{k}");
        }
        // The same entries count once the season locks.
        let locked = send_at(&fake, LOCKED, "GET", "/api/seasons/2023/standings", None, "").1["standings"].clone();
        assert_ne!(locked[0]["max_possible"], locked[1]["max_possible"]);
    }

    #[test]
    fn progress_tells_untouched_started_and_done_playoff_rankings() {
        let fake = rank_pool(12, 4);
        let states = |fake: &Fake| {
            let (_, body) = get(fake, "/api/seasons/2023/progress", None);
            body["players"].as_array().unwrap().iter().map(|p| p["playoff_state"].clone()).collect::<Vec<_>>()
        };
        let mine = |fake: &Fake| get(fake, PUT_PICKS, Some(BO)).1["playoff_done"].clone();
        let forward = entry(&by_seed(12).join(","));
        let backward = entry(&(1..=12).map(|s| format!(r#"{{"team_season_id":{},"rank":{s}}}"#, 100 + s)).collect::<Vec<_>>().join(","));
        let done = |entry: &str| entry.replace(r#""playoff""#, r#""playoff_done":true,"playoff""#);
        let save = |body: &str| assert_eq!(send(&fake, "PUT", PUT_PICKS, Some(BO), body).0, 200);
        assert_eq!(states(&fake), ["untouched", "untouched"]);

        // The first save is the auto-shuffle, and saving the same ranking again changes nothing.
        save(&forward);
        save(&forward);
        // Two changes are not yet enough, the third is.
        save(&backward);
        save(&forward);
        assert_eq!(states(&fake), ["untouched", "untouched"]);
        save(&backward);
        assert_eq!(states(&fake), ["untouched", "started"]);

        // Confirming makes it done; editing afterwards keeps it, saving without the flag withdraws it.
        save(&done(&backward));
        assert_eq!((states(&fake), mine(&fake)), (vec!["untouched".into(), "done".into()], true.into()));
        save(&done(&forward));
        assert_eq!(states(&fake), ["untouched", "done"]);
        save(&forward);
        assert_eq!((states(&fake), mine(&fake)), (vec!["untouched".into(), "started".into()], false.into()));

        // A refused (stale) save changes nothing and the answer carries the confirmation.
        save(&done(&forward));
        let stale = forward.replace(r#""playoff""#, r#""base_version":"old","playoff""#);
        assert_eq!(send(&fake, "PUT", PUT_PICKS, Some(BO), &stale).1["playoff_done"], true);
        assert_eq!(states(&fake), ["untouched", "done"]);

        // A confirmed ranking naming a team the bracket no longer has is not complete.
        fake.ranks.borrow_mut()[0].team_season_id = TeamSeasonId(1);
        assert_eq!(states(&fake), ["untouched", "started"]);
        let (_, plain) = get(&pool(), "/api/seasons/2023/progress", None);
        assert!(plain["players"][0].get("playoff_state").is_none());
    }

    #[test]
    fn a_playoff_flag_means_nothing_in_a_season_that_does_not_rank() {
        let fake = Fake { bracket: field(12, 4), ..pool() };
        let (_, body) = get(&fake, "/api/seasons/2023/games", None);
        assert_eq!(body["games"].as_array().unwrap().len(), 13);
        assert!(body.get("playoff").is_none());
        assert_eq!(get(&fake, "/api/seasons/2023/standings", None).1["playoff_ranked"], false);
    }
}
