//! [`Storage`] over a D1 binding.
//!
//! Integers are bound as JS numbers: `JsValue::from(i64)` would produce a
//! BigInt, which D1 rejects.

use chrono::{DateTime, Utc};
use pickem_core::sql;
use pickem_core::{
    EmailHash, Event, EventId, Game, GameId, GameResult, GameSlot, Pick, ResultSource, Season, SeasonId, SlotId,
    SlotSource, Storage, TeamSeason, TeamSeasonId, User, UserId,
};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use wasm_bindgen::JsValue;
use worker::{D1Database, D1PreparedStatement, Error, Result};

pub struct D1Storage(pub D1Database);

fn num(n: i64) -> JsValue {
    JsValue::from_f64(n as f64)
}

#[derive(Deserialize)]
struct GenerationRow {
    generation: u64,
}

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
struct SlotRow {
    id: i64,
    game_id: i64,
    slot_index: u8,
    team_season_id: Option<i64>,
    feeder_game_id: Option<i64>,
    seed: Option<u16>,
}

#[derive(Deserialize)]
struct TeamSeasonRow {
    id: i64,
    name: String,
    rank: Option<u32>,
    record: Option<String>,
}

#[derive(Deserialize)]
struct EventRow {
    id: i64,
    name: String,
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
        let args: Vec<JsValue> = args.iter().map(|&n| num(n)).collect();
        self.0.prepare(sql).bind(&args)?.all().await?.results()
    }

    /// Run `statements` as one transaction; the last must be the generation
    /// bump, whose row is returned.
    async fn batch_generation(&self, statements: Vec<D1PreparedStatement>) -> Result<u64> {
        let results = self.0.batch(statements).await?;
        let rows: Vec<GenerationRow> = results.last().ok_or_else(|| Error::RustError("empty batch".into()))?.results()?;
        rows.first().map(|r| r.generation).ok_or_else(|| Error::RustError("season not found".into()))
    }

    fn statement(&self, sql: &str, args: &[JsValue]) -> Result<D1PreparedStatement> {
        self.0.prepare(sql).bind(args)
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

    async fn slots_for_season(&self, season: SeasonId) -> Result<Vec<GameSlot>> {
        let rows: Vec<SlotRow> = self.query(sql::SLOTS_FOR_SEASON, &[season.0]).await?;
        Ok(rows
            .into_iter()
            .map(|r| GameSlot {
                id: SlotId(r.id),
                game_id: GameId(r.game_id),
                slot_index: r.slot_index,
                source: match (r.team_season_id, r.feeder_game_id) {
                    (Some(t), _) => SlotSource::Team { team_season_id: TeamSeasonId(t) },
                    (None, Some(g)) => SlotSource::WinnerOf { game_id: GameId(g) },
                    (None, None) => unreachable!("game_slot CHECK admits exactly one source"),
                },
                seed: r.seed,
            })
            .collect())
    }

    async fn team_seasons_for_season(&self, season: SeasonId) -> Result<Vec<TeamSeason>> {
        let rows: Vec<TeamSeasonRow> = self.query(sql::TEAM_SEASONS_FOR_SEASON, &[season.0]).await?;
        Ok(rows
            .into_iter()
            .map(|r| TeamSeason { id: TeamSeasonId(r.id), name: r.name, rank: r.rank, record: r.record })
            .collect())
    }

    async fn events(&self) -> Result<Vec<Event>> {
        let rows: Vec<EventRow> = self.query(sql::EVENTS, &[]).await?;
        Ok(rows.into_iter().map(|r| Event { id: EventId(r.id), name: r.name }).collect())
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

    async fn replace_picks(&self, user: UserId, season: SeasonId, picks: &[Pick]) -> Result<u64> {
        let mut statements = vec![self.statement(sql::DELETE_PICKS, &[num(user.0), num(season.0)])?];
        for p in picks {
            let confidence = p.confidence.map_or(JsValue::NULL, |c| num(c.into()));
            let args = [num(user.0), num(p.game_id.0), num(season.0), num(p.slot_id.0), confidence];
            statements.push(self.statement(sql::INSERT_PICK, &args)?);
        }
        statements.push(self.statement(sql::BUMP_GENERATION, &[num(season.0)])?);
        self.batch_generation(statements).await
    }

    async fn record_result(&self, result: GameResult) -> Result<u64> {
        #[derive(Deserialize)]
        struct GameSeason {
            season_id: i64,
        }
        let seasons: Vec<GameSeason> = self.query(sql::GAME_SEASON, &[result.game_id.0]).await?;
        let season = seasons.first().ok_or_else(|| Error::RustError("game not found".into()))?.season_id;
        let upsert = [num(result.game_id.0), num(result.winner_slot_id.0), result.source.as_str().into()];
        self.batch_generation(vec![
            self.statement(sql::UPSERT_RESULT, &upsert)?,
            self.statement(sql::BUMP_GENERATION, &[num(season)])?,
        ])
        .await
    }
}
