//! Every statement the adapters run, so D1 and SQLite cannot drift apart.
//!
//! Parameters are numbered (`?1`), which both bind by position. Timestamps
//! are written as RFC 3339 UTC, the form [`crate::model`] parses.

pub const SEASONS: &str = "SELECT id, year, locks_at, generation, playoff_format FROM season";

pub const SEASON_BY_YEAR: &str = "SELECT id, year, locks_at, generation, playoff_format FROM season WHERE year = ?1";

pub const GAMES_FOR_SEASON: &str = "SELECT id, season_id, event_id, display_name, kickoff_at, fixed_wager, playoff
     FROM game WHERE season_id = ?1 ORDER BY id";

pub const SLOTS_FOR_SEASON: &str = "SELECT s.id, s.game_id, s.slot_index, s.team_season_id, s.feeder_game_id, s.seed
     FROM game_slot s JOIN game g ON g.id = s.game_id
     WHERE g.season_id = ?1 ORDER BY s.id";

pub const TEAM_SEASONS_FOR_SEASON: &str = "SELECT ts.id, t.name, ts.rank, ts.record
     FROM team_season ts JOIN team t ON t.id = ts.team_id
     WHERE ts.season_id = ?1 ORDER BY ts.id";

pub const EVENTS: &str = "SELECT id, name FROM event ORDER BY id";

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

pub const ALL: &[&str] = &[
    SEASONS,
    SEASON_BY_YEAR,
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
    BUMP_GENERATION_FOR_PICKS,
    UPSERT_RESULT,
    BUMP_GENERATION,
];
