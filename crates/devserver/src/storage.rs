use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use pickem_core::sql;
use pickem_core::{
    email_hash, EmailHash, Game, GameId, GameResult, GameSlot, Pick, ResultSource, SeasonId, Season, SlotId,
    SlotSource, Storage, TeamSeasonId, User, UserId,
};
use rusqlite::types::Type;
use rusqlite::{params, Connection, Row};

fn migrations_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations")
}

/// Create a fresh database at `path` with every migration applied.
pub fn create(path: &Path) -> rusqlite::Result<SqliteStorage> {
    let conn = Connection::open(path)?;
    let mut files: Vec<_> = fs::read_dir(migrations_dir())
        .expect("migrations directory")
        .map(|e| e.expect("migration entry").path())
        .filter(|p| p.extension().is_some_and(|x| x == "sql"))
        .collect();
    files.sort();
    for file in files {
        conn.execute_batch(&fs::read_to_string(file).expect("readable migration"))?;
    }
    Ok(SqliteStorage { conn })
}

pub struct SqliteStorage {
    pub conn: Connection,
}

impl SqliteStorage {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        Ok(Self { conn: Connection::open(path)? })
    }

    /// Set the digest of the account imported from `legacy_username`, so it
    /// can sign in. Returns the digest, which is also what to write to the
    /// same column in D1.
    pub fn attach_email(
        &self,
        key: &[u8],
        legacy_username: &str,
        email: &str,
    ) -> rusqlite::Result<EmailHash> {
        let hash = email_hash(key, email);
        let changed = self.conn.execute(
            "UPDATE app_user SET email_hash = ? WHERE legacy_username = ?",
            params![hash.as_str(), legacy_username],
        )?;
        if changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(hash)
    }
}

fn timestamp(row: &Row, idx: usize) -> rusqlite::Result<DateTime<Utc>> {
    let text: String = row.get(idx)?;
    DateTime::parse_from_rfc3339(&text)
        .map(Into::into)
        .map_err(|e| rusqlite::Error::FromSqlConversionFailure(idx, Type::Text, e.to_string().into()))
}

impl Storage for SqliteStorage {
    type Error = rusqlite::Error;

    async fn seasons(&self) -> Result<Vec<Season>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::SEASONS)?;
        let seasons = stmt.query_map([], season_row)?;
        seasons.collect()
    }

    async fn season_by_year(&self, year: u16) -> Result<Option<Season>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::SEASON_BY_YEAR)?;
        let mut rows = stmt.query([year])?;
        rows.next()?.map(season_row).transpose()
    }

    async fn games_for_season(&self, season: SeasonId) -> Result<Vec<Game>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::GAMES_FOR_SEASON)?;
        let games = stmt.query_map([season.0], |r| {
            Ok(Game {
                id: GameId(r.get(0)?),
                season_id: SeasonId(r.get(1)?),
                event_id: pickem_core::EventId(r.get(2)?),
                display_name: r.get(3)?,
                kickoff_at: timestamp(r, 4)?,
                fixed_wager: r.get(5)?,
            })
        })?;
        games.collect()
    }

    async fn slots_for_season(&self, season: SeasonId) -> Result<Vec<GameSlot>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::SLOTS_FOR_SEASON)?;
        let slots = stmt.query_map([season.0], |r| {
            let team: Option<i64> = r.get(3)?;
            let feeder: Option<i64> = r.get(4)?;
            Ok(GameSlot {
                id: SlotId(r.get(0)?),
                game_id: GameId(r.get(1)?),
                slot_index: r.get(2)?,
                source: match (team, feeder) {
                    (Some(t), None) => SlotSource::Team { team_season_id: TeamSeasonId(t) },
                    (None, Some(g)) => SlotSource::WinnerOf { game_id: GameId(g) },
                    _ => unreachable!("game_slot CHECK admits exactly one source"),
                },
                seed: r.get(5)?,
            })
        })?;
        slots.collect()
    }

    async fn results_for_season(&self, season: SeasonId) -> Result<Vec<GameResult>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::RESULTS_FOR_SEASON)?;
        let results = stmt.query_map([season.0], |r| {
            Ok(GameResult {
                game_id: GameId(r.get(0)?),
                winner_slot_id: SlotId(r.get(1)?),
                source: match r.get::<_, String>(2)?.as_str() {
                    "manual" => ResultSource::Manual,
                    "cfbd" => ResultSource::Cfbd,
                    _ => ResultSource::Import,
                },
            })
        })?;
        results.collect()
    }

    async fn picks_for_season(&self, season: SeasonId) -> Result<Vec<Pick>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::PICKS_FOR_SEASON)?;
        let picks = stmt.query_map([season.0], |r| {
            Ok(Pick {
                user_id: UserId(r.get(0)?),
                game_id: GameId(r.get(1)?),
                season_id: SeasonId(r.get(2)?),
                slot_id: SlotId(r.get(3)?),
                confidence: r.get(4)?,
            })
        })?;
        picks.collect()
    }

    async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::USER_BY_EMAIL_HASH)?;
        let mut rows = stmt.query([hash.as_str()])?;
        rows.next()?.map(user_row).transpose()
    }

    async fn users(&self) -> Result<Vec<User>, Self::Error> {
        let mut stmt = self.conn.prepare(sql::USERS)?;
        let users = stmt.query_map([], user_row)?;
        users.collect()
    }

    async fn replace_picks(
        &self,
        user: UserId,
        season: SeasonId,
        picks: &[Pick],
    ) -> Result<u64, Self::Error> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(sql::DELETE_PICKS, params![user.0, season.0])?;
        for p in picks {
            tx.execute(
                sql::INSERT_PICK,
                params![user.0, p.game_id.0, season.0, p.slot_id.0, p.confidence],
            )?;
        }
        let generation = bump_generation(&tx, season)?;
        tx.commit()?;
        Ok(generation)
    }

    async fn record_result(&self, result: GameResult) -> Result<u64, Self::Error> {
        let tx = self.conn.unchecked_transaction()?;
        let season: i64 = tx.query_row(sql::GAME_SEASON, [result.game_id.0], |r| r.get(0))?;
        let source = match result.source {
            ResultSource::Manual => "manual",
            ResultSource::Cfbd => "cfbd",
            ResultSource::Import => "import",
        };
        tx.execute(sql::UPSERT_RESULT, params![result.game_id.0, result.winner_slot_id.0, source])?;
        let generation = bump_generation(&tx, SeasonId(season))?;
        tx.commit()?;
        Ok(generation)
    }
}

fn season_row(r: &Row) -> rusqlite::Result<Season> {
    Ok(Season {
        id: SeasonId(r.get(0)?),
        year: r.get(1)?,
        locks_at: timestamp(r, 2)?,
        generation: r.get(3)?,
    })
}

fn user_row(r: &Row) -> rusqlite::Result<User> {
    Ok(User {
        id: UserId(r.get(0)?),
        email_hash: r.get::<_, Option<String>>(1)?.map(EmailHash::from_encoded),
        display_name: r.get(2)?,
        is_admin: r.get(3)?,
    })
}

fn bump_generation(tx: &rusqlite::Transaction, season: SeasonId) -> rusqlite::Result<u64> {
    tx.query_row(sql::BUMP_GENERATION, [season.0], |r| r.get(0))
}
