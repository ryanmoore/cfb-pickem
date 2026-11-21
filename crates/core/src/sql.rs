//! Every statement the adapters run, so D1 and SQLite cannot drift apart.
//!
//! Parameters are numbered (`?1`), which both bind by position. Timestamps
//! are written as RFC 3339 UTC, the form [`crate::model`] parses.

use serde::Serialize;

use crate::model::PlayoffFormat;
use crate::season_doc::SeasonDoc;

pub const SEASONS: &str = "SELECT id, year, locks_at, generation, playoff_format, practice, draft FROM season";

pub const SEASON_BY_YEAR: &str =
    "SELECT id, year, locks_at, generation, playoff_format, practice, draft FROM season WHERE year = ?1";

/// The same rows as the `*_FOR_SEASON` statements, for every season at once,
/// so reading the whole archive costs a fixed number of queries.
pub const ALL_GAMES: &str = "SELECT id, season_id, event_id, display_name, kickoff_at, fixed_wager, playoff FROM game";

pub const ALL_SLOTS: &str = "SELECT id, game_id, slot_index, team_season_id, feeder_game_id, seed FROM game_slot";

pub const ALL_RESULTS: &str = "SELECT game_id, winner_slot_id, source FROM game_result";

pub const ALL_PICKS: &str = "SELECT user_id, game_id, season_id, slot_id, confidence FROM pick";

pub const ALL_PLAYOFF_RANKS: &str = "SELECT user_id, team_season_id, rank FROM playoff_rank";

pub const GAMES_FOR_SEASON: &str = "SELECT id, season_id, event_id, display_name, kickoff_at, fixed_wager, playoff
     FROM game WHERE season_id = ?1 ORDER BY id";

pub const SLOTS_FOR_SEASON: &str = "SELECT s.id, s.game_id, s.slot_index, s.team_season_id, s.feeder_game_id, s.seed
     FROM game_slot s JOIN game g ON g.id = s.game_id
     WHERE g.season_id = ?1 ORDER BY s.id";

pub const TEAM_SEASONS_FOR_SEASON: &str = "SELECT ts.id, t.name, t.mascot, t.color, t.alt_color, ts.rank, ts.record
     FROM team_season ts JOIN team t ON t.id = ts.team_id
     WHERE ts.season_id = ?1 ORDER BY ts.id";

pub const EVENTS: &str = "SELECT id, slug, name FROM event ORDER BY id";

pub const TEAMS: &str = "SELECT id, slug, name FROM team ORDER BY id";

pub const RESULTS_FOR_SEASON: &str = "SELECT r.game_id, r.winner_slot_id, r.source
     FROM game_result r JOIN game g ON g.id = r.game_id
     WHERE g.season_id = ?1 ORDER BY r.game_id";

pub const PICKS_FOR_SEASON: &str = "SELECT user_id, game_id, season_id, slot_id, confidence
     FROM pick WHERE season_id = ?1 ORDER BY user_id, game_id";

pub const USER_BY_EMAIL_HASH: &str =
    "SELECT id, email_hash, display_name, is_admin FROM app_user WHERE email_hash = ?1";

pub const USERS: &str = "SELECT id, email_hash, display_name, is_admin FROM app_user ORDER BY id";

pub const PLAYOFF_RANKS_FOR_SEASON: &str = "SELECT user_id, team_season_id, rank
     FROM playoff_rank WHERE season_id = ?1 ORDER BY user_id, rank DESC";

/// A player's version for a season: the timestamp every row of their picks and
/// ranking carries, or nothing when they have neither.
pub const PICKS_VERSION: &str = "SELECT max(updated_at) AS version FROM (
         SELECT updated_at FROM pick WHERE user_id = ?1 AND season_id = ?2
         UNION ALL
         SELECT updated_at FROM playoff_rank WHERE user_id = ?1 AND season_id = ?2)";

/// Parameters: user, season, expected version. Deletes nothing unless the
/// expectation is null (unconditional) or equals the player's current version
/// (as in [`PICKS_VERSION`], the empty string when they have neither), so a
/// refused save deletes from neither table.
pub const DELETE_PICKS: &str = "DELETE FROM pick WHERE user_id = ?1 AND season_id = ?2
     AND (?3 IS NULL OR ?3 = IFNULL((SELECT max(updated_at) FROM (
         SELECT updated_at FROM pick WHERE user_id = ?1 AND season_id = ?2
         UNION ALL
         SELECT updated_at FROM playoff_rank WHERE user_id = ?1 AND season_id = ?2)), ''))";

/// Parameters as [`DELETE_PICKS`].
pub const DELETE_RANKS: &str = "DELETE FROM playoff_rank WHERE user_id = ?1 AND season_id = ?2
     AND (?3 IS NULL OR ?3 = IFNULL((SELECT max(updated_at) FROM (
         SELECT updated_at FROM pick WHERE user_id = ?1 AND season_id = ?2
         UNION ALL
         SELECT updated_at FROM playoff_rank WHERE user_id = ?1 AND season_id = ?2)), ''))";

/// Parameters: user, game, season, slot, confidence, new version. Inserts only
/// while no row of another version is left, so a refused delete stops the
/// inserts too.
pub const INSERT_PICK: &str = "INSERT INTO pick (user_id, game_id, season_id, slot_id, confidence, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6
     WHERE NOT EXISTS (SELECT 1 FROM pick WHERE user_id = ?1 AND season_id = ?3 AND updated_at <> ?6)
       AND NOT EXISTS (SELECT 1 FROM playoff_rank WHERE user_id = ?1 AND season_id = ?3 AND updated_at <> ?6)";

/// Parameters: user, season, team, rank, new version; guarded like [`INSERT_PICK`].
pub const INSERT_RANK: &str = "INSERT INTO playoff_rank (user_id, season_id, team_season_id, rank, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5
     WHERE NOT EXISTS (SELECT 1 FROM pick WHERE user_id = ?1 AND season_id = ?2 AND updated_at <> ?5)
       AND NOT EXISTS (SELECT 1 FROM playoff_rank WHERE user_id = ?1 AND season_id = ?2 AND updated_at <> ?5)";

pub const PLAYOFF_STATUS_FOR_SEASON: &str =
    "SELECT user_id, playoff_done_at IS NOT NULL AS done, playoff_moves AS moves FROM player_season WHERE season_id = ?1 ORDER BY user_id";

/// Parameters: user, season, new version, ranking changed (0 or 1), done (0 or 1).
/// Writes only when the new set was; an earlier confirmation keeps its time.
pub const SAVE_PLAYOFF_STATUS: &str = "INSERT INTO player_season (user_id, season_id, playoff_done_at, playoff_moves)
     SELECT ?1, ?2, CASE WHEN ?5 THEN ?3 END, ?4
     WHERE EXISTS (SELECT 1 FROM pick WHERE user_id = ?1 AND season_id = ?2 AND updated_at = ?3
                   UNION ALL
                   SELECT 1 FROM playoff_rank WHERE user_id = ?1 AND season_id = ?2 AND updated_at = ?3)
     ON CONFLICT (user_id, season_id) DO UPDATE SET
         playoff_done_at = CASE WHEN ?5 THEN COALESCE(playoff_done_at, ?3) END,
         playoff_moves = playoff_moves + ?4";

/// Parameters: season, user, new version. Bumps only when the new set was written.
pub const BUMP_GENERATION_FOR_PICKS: &str = "UPDATE season SET generation = generation + 1
     WHERE id = ?1 AND EXISTS (
         SELECT 1 FROM pick WHERE user_id = ?2 AND season_id = ?1 AND updated_at = ?3
         UNION ALL
         SELECT 1 FROM playoff_rank WHERE user_id = ?2 AND season_id = ?1 AND updated_at = ?3)
     RETURNING generation";

/// Parameters: game, winning slot, source.
pub const UPSERT_RESULT: &str = "INSERT OR REPLACE INTO game_result (game_id, winner_slot_id, source, recorded_at)
     VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";

pub const BUMP_GENERATION: &str =
    "UPDATE season SET generation = generation + 1 WHERE id = ?1 RETURNING generation";

pub const PUBLISH_SEASON: &str = "UPDATE season SET draft = 0, generation = generation + 1
     WHERE year = ?1 AND draft = 1 RETURNING generation";

pub const DELETE_DRAFT: &str = "DELETE FROM season WHERE year = ?1 AND draft = 1";

/// A statement parameter.
pub enum Arg {
    Int(i64),
    Text(String),
}

fn json(v: &impl Serialize) -> Arg {
    Arg::Text(serde_json::to_string(v).expect("documents serialise"))
}

/// The statements that replace a year's draft season with `doc`, in order,
/// with their arguments. Rows are found by slug and year rather than id, so
/// the whole set runs as one batch of a fixed length however large the
/// season is, and the document's JSON is expanded by `json_each`.
pub fn replace_draft(doc: &SeasonDoc, created_at: &str) -> Vec<(&'static str, Vec<Arg>)> {
    let year = || Arg::Int(doc.year.into());
    let format = if doc.playoff_format == PlayoffFormat::Rank { "rank" } else { "fixed" };
    vec![
        (DELETE_DRAFT, vec![year()]),
        (
            INSERT_DRAFT_SEASON,
            vec![year(), Arg::Text(doc.locks_at.clone().expect("validated")), Arg::Text(format.into()), Arg::Int(doc.practice.into()), Arg::Text(created_at.into())],
        ),
        (INSERT_NEW_EVENTS, vec![json(&doc.new_bowls)]),
        (INSERT_NEW_TEAMS, vec![json(&doc.new_teams)]),
        (INSERT_DRAFT_TEAM_SEASONS, vec![year(), json(&doc.teams)]),
        (INSERT_DRAFT_GAMES, vec![year(), json(&doc.games)]),
        (INSERT_DRAFT_SLOTS, vec![year(), json(&doc.games)]),
    ]
}

const INSERT_DRAFT_SEASON: &str = "INSERT INTO season (year, locks_at, playoff_format, practice, draft, generation, created_at)
     VALUES (?1, ?2, ?3, ?4, 1, 1, ?5)";

const INSERT_NEW_EVENTS: &str = "INSERT OR IGNORE INTO event (slug, name) SELECT key, value FROM json_each(?1)";

const INSERT_NEW_TEAMS: &str = "INSERT OR IGNORE INTO team (slug, name, mascot, color, alt_color)
     SELECT key, json_extract(value, '$.name'), json_extract(value, '$.mascot'),
            json_extract(value, '$.color'), json_extract(value, '$.alt_color')
     FROM json_each(?1)";

const INSERT_DRAFT_TEAM_SEASONS: &str = "INSERT INTO team_season (season_id, team_id, rank, record)
     SELECT s.id, t.id, json_extract(j.value, '$.rank'), json_extract(j.value, '$.record')
     FROM season s, json_each(?2) j JOIN team t ON t.slug = j.key
     WHERE s.year = ?1";

const INSERT_DRAFT_GAMES: &str = "INSERT INTO game (season_id, event_id, display_name, kickoff_at, fixed_wager, playoff, external_id)
     SELECT s.id, e.id, json_extract(g.value, '$.name'), json_extract(g.value, '$.kickoff_at'),
            json_extract(g.value, '$.fixed_wager'), COALESCE(json_extract(g.value, '$.playoff'), 0),
            json_extract(g.value, '$.external_id')
     FROM season s, json_each(?2) g JOIN event e ON e.slug = json_extract(g.value, '$.bowl')
     WHERE s.year = ?1";

const INSERT_DRAFT_SLOTS: &str = "INSERT INTO game_slot (game_id, slot_index, team_season_id, feeder_game_id, seed)
     SELECT gm.id, sl.key, ts.id, fg.id, json_extract(sl.value, '$.seed')
     FROM season s
     JOIN json_each(?2) g
     JOIN json_each(g.value, '$.slots') sl
     JOIN event ge ON ge.slug = json_extract(g.value, '$.bowl')
     JOIN game gm ON gm.season_id = s.id AND gm.event_id = ge.id
     LEFT JOIN team t ON t.slug = json_extract(sl.value, '$.team')
     LEFT JOIN team_season ts ON ts.season_id = s.id AND ts.team_id = t.id
     LEFT JOIN event fe ON fe.slug = json_extract(sl.value, '$.winner_of')
     LEFT JOIN game fg ON fg.season_id = s.id AND fg.event_id = fe.id
     WHERE s.year = ?1";

pub const ALL: &[&str] = &[
    SEASONS,
    SEASON_BY_YEAR,
    ALL_GAMES,
    ALL_SLOTS,
    ALL_RESULTS,
    ALL_PICKS,
    ALL_PLAYOFF_RANKS,
    GAMES_FOR_SEASON,
    SLOTS_FOR_SEASON,
    TEAM_SEASONS_FOR_SEASON,
    EVENTS,
    RESULTS_FOR_SEASON,
    PICKS_FOR_SEASON,
    USER_BY_EMAIL_HASH,
    USERS,
    PLAYOFF_RANKS_FOR_SEASON,
    PICKS_VERSION,
    DELETE_PICKS,
    DELETE_RANKS,
    INSERT_PICK,
    INSERT_RANK,
    PLAYOFF_STATUS_FOR_SEASON,
    SAVE_PLAYOFF_STATUS,
    BUMP_GENERATION_FOR_PICKS,
    UPSERT_RESULT,
    BUMP_GENERATION,
    TEAMS,
    PUBLISH_SEASON,
    DELETE_DRAFT,
    INSERT_DRAFT_SEASON,
    INSERT_NEW_EVENTS,
    INSERT_NEW_TEAMS,
    INSERT_DRAFT_TEAM_SEASONS,
    INSERT_DRAFT_GAMES,
    INSERT_DRAFT_SLOTS,
];
