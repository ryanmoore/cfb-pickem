//! [`Storage`] over a D1 binding.
//!
//! Integers are bound as JS numbers: `JsValue::from(i64)` would produce a
//! BigInt, which D1 rejects.

use chrono::{DateTime, Utc};
use pickem_core::sql;
use pickem_core::{
    EmailHash, EventId, Game, GameId, GameResult, GameSlot, Pick, ResultSource, Season, SeasonId, SlotId,
    Storage, User, UserId,
};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use wasm_bindgen::JsValue;
use worker::{D1Database, Error, Result};

pub struct D1Storage(pub D1Database);

fn time(text: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(text)
        .map(Into::into)
        .map_err(|e| Error::RustError(format!("bad timestamp {text:?}: {e}")))
}

#[derive(Deserialize)]
struct SeasonRow {
    id: i64,
    year: u16,
    locks_at: String,
    generation: u64,
}

impl SeasonRow {
    fn into_season(self) -> Result<Season> {
        Ok(Season {
            id: SeasonId(self.id),
            year: self.year,
            locks_at: time(&self.locks_at)?,
            generation: self.generation,
        })
    }
}

#[derive(Deserialize)]
struct GameRow {
    id: i64,
    season_id: i64,
    event_id: i64,
    display_name: Option<String>,
    kickoff_at: String,
    fixed_wager: Option<u32>,
}

#[derive(Deserialize)]
struct ResultRow {
    game_id: i64,
    winner_slot_id: i64,
    source: String,
}

#[derive(Deserialize)]
struct PickRow {
    user_id: i64,
    game_id: i64,
    season_id: i64,
    slot_id: i64,
    confidence: Option<u32>,
}

#[derive(Deserialize)]
struct UserRow {
    id: i64,
    email_hash: Option<String>,
    display_name: String,
    is_admin: i64,
}

impl From<UserRow> for User {
    fn from(r: UserRow) -> Self {
        User {
            id: UserId(r.id),
            email_hash: r.email_hash.map(EmailHash::from_encoded),
            display_name: r.display_name,
            is_admin: r.is_admin != 0,
        }
    }
}

impl D1Storage {
    async fn query<T: DeserializeOwned>(&self, sql: &str, args: &[i64]) -> Result<Vec<T>> {
        let args: Vec<JsValue> = args.iter().map(|&n| JsValue::from_f64(n as f64)).collect();
        self.0.prepare(sql).bind(&args)?.all().await?.results()
    }
}

impl Storage for D1Storage {
    type Error = Error;

    async fn seasons(&self) -> Result<Vec<Season>> {
        let rows: Vec<SeasonRow> = self.query(sql::SEASONS, &[]).await?;
        rows.into_iter().map(SeasonRow::into_season).collect()
    }

    async fn season_by_year(&self, year: u16) -> Result<Option<Season>> {
        let rows: Vec<SeasonRow> = self.query(sql::SEASON_BY_YEAR, &[year.into()]).await?;
        rows.into_iter().next().map(SeasonRow::into_season).transpose()
    }

    async fn games_for_season(&self, season: SeasonId) -> Result<Vec<Game>> {
        let rows: Vec<GameRow> = self
            .query(sql::GAMES_FOR_SEASON, &[season.0])
            .await?;
        rows.into_iter()
            .map(|r| {
                Ok(Game {
                    id: GameId(r.id),
                    season_id: SeasonId(r.season_id),
                    event_id: EventId(r.event_id),
                    display_name: r.display_name,
                    kickoff_at: time(&r.kickoff_at)?,
                    fixed_wager: r.fixed_wager,
                })
            })
            .collect()
    }

    async fn slots_for_season(&self, _: SeasonId) -> Result<Vec<GameSlot>> {
        Err(Error::RustError("slots are not served yet".into()))
    }

    async fn results_for_season(&self, season: SeasonId) -> Result<Vec<GameResult>> {
        let rows: Vec<ResultRow> = self
            .query(sql::RESULTS_FOR_SEASON, &[season.0])
            .await?;
        Ok(rows
            .into_iter()
            .map(|r| GameResult {
                game_id: GameId(r.game_id),
                winner_slot_id: SlotId(r.winner_slot_id),
                source: match r.source.as_str() {
                    "manual" => ResultSource::Manual,
                    "cfbd" => ResultSource::Cfbd,
                    _ => ResultSource::Import,
                },
            })
            .collect())
    }

    async fn picks_for_season(&self, season: SeasonId) -> Result<Vec<Pick>> {
        let rows: Vec<PickRow> = self
            .query(sql::PICKS_FOR_SEASON, &[season.0])
            .await?;
        Ok(rows
            .into_iter()
            .map(|r| Pick {
                user_id: UserId(r.user_id),
                game_id: GameId(r.game_id),
                season_id: SeasonId(r.season_id),
                slot_id: SlotId(r.slot_id),
                confidence: r.confidence,
            })
            .collect())
    }

    async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>> {
        let rows: Vec<UserRow> = self
            .0
            .prepare(sql::USER_BY_EMAIL_HASH)
            .bind(&[hash.as_str().into()])?
            .all()
            .await?
            .results()?;
        Ok(rows.into_iter().next().map(Into::into))
    }

    async fn users(&self) -> Result<Vec<User>> {
        let rows: Vec<UserRow> = self
            .query(sql::USERS, &[]).await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn replace_picks(&self, _: UserId, _: SeasonId, _: &[Pick]) -> Result<u64> {
        Err(Error::RustError("writes are not served yet".into()))
    }

    async fn record_result(&self, _: GameResult) -> Result<u64> {
        Err(Error::RustError("writes are not served yet".into()))
    }
}
