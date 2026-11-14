//! Every statement the adapters run, so D1 and SQLite cannot drift apart.
//!
//! Parameters are numbered (`?1`), which both bind by position. Timestamps
//! are written as RFC 3339 UTC, the form [`crate::model`] parses.

pub const SEASONS: &str = "SELECT id, year, locks_at, generation FROM season";

pub const SEASON_BY_YEAR: &str = "SELECT id, year, locks_at, generation FROM season WHERE year = ?1";

pub const GAMES_FOR_SEASON: &str = "SELECT id, season_id, event_id, display_name, kickoff_at, fixed_wager
     FROM game WHERE season_id = ?1 ORDER BY id";

pub const SLOTS_FOR_SEASON: &str = "SELECT s.id, s.game_id, s.slot_index, s.team_season_id, s.feeder_game_id, s.seed
     FROM game_slot s JOIN game g ON g.id = s.game_id
     WHERE g.season_id = ?1 ORDER BY s.id";

pub const RESULTS_FOR_SEASON: &str = "SELECT r.game_id, r.winner_slot_id, r.source
     FROM game_result r JOIN game g ON g.id = r.game_id
     WHERE g.season_id = ?1 ORDER BY r.game_id";

pub const PICKS_FOR_SEASON: &str = "SELECT user_id, game_id, season_id, slot_id, confidence
     FROM pick WHERE season_id = ?1 ORDER BY user_id, game_id";

pub const USER_BY_EMAIL_HASH: &str =
    "SELECT id, email_hash, display_name, is_admin FROM app_user WHERE email_hash = ?1";

pub const USERS: &str = "SELECT id, email_hash, display_name, is_admin FROM app_user ORDER BY id";

pub const DELETE_PICKS: &str = "DELETE FROM pick WHERE user_id = ?1 AND season_id = ?2";

/// Parameters: user, game, season, slot, confidence.
pub const INSERT_PICK: &str = "INSERT INTO pick (user_id, game_id, season_id, slot_id, confidence, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";

pub const GAME_SEASON: &str = "SELECT season_id FROM game WHERE id = ?1";

/// Parameters: game, winning slot, source.
pub const UPSERT_RESULT: &str = "INSERT OR REPLACE INTO game_result (game_id, winner_slot_id, source, recorded_at)
     VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";

pub const BUMP_GENERATION: &str =
    "UPDATE season SET generation = generation + 1 WHERE id = ?1 RETURNING generation";

pub const ALL: &[&str] = &[
    SEASONS,
    SEASON_BY_YEAR,
    GAMES_FOR_SEASON,
    SLOTS_FOR_SEASON,
    RESULTS_FOR_SEASON,
    PICKS_FOR_SEASON,
    USER_BY_EMAIL_HASH,
    USERS,
    DELETE_PICKS,
    INSERT_PICK,
    GAME_SEASON,
    UPSERT_RESULT,
    BUMP_GENERATION,
];
