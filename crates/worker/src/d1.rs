//! [`Storage`] over a D1 binding.
//!
//! Integers are bound as JS numbers: `JsValue::from(i64)` would produce a
//! BigInt, which D1 rejects.

use chrono::{DateTime, Utc};
use pickem_core::sql;
use pickem_core::{
    Archive, EmailHash, Event, EventId, Game, GameId, GameResult, GameSlot, Pick, PlayoffFormat, PlayoffRank, ResultSource, Season, SeasonId, SlotId,
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

#[derive(Deserialize)]
struct VersionRow {
    version: Option<String>,
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
    playoff_format: String,
    practice: i64,
}

impl SeasonRow {
    fn into_season(self) -> Result<Season> {
        Ok(Season {
            id: SeasonId(self.id),
            year: self.year,
            locks_at: time(&self.locks_at)?,
            generation: self.generation,
            playoff_format: PlayoffFormat::from_stored(&self.playoff_format),
            practice: self.practice != 0,
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
    playoff: i64,
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
    slot_id: Option<i64>,
    confidence: Option<u32>,
}

#[derive(Deserialize)]
struct RankRow {
    user_id: i64,
    team_season_id: i64,
    rank: u32,
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

fn games(rows: Vec<GameRow>) -> Result<Vec<Game>> {
    rows.into_iter()
        .map(|r| {
            Ok(Game {
                id: GameId(r.id),
                season_id: SeasonId(r.season_id),
                event_id: EventId(r.event_id),
                display_name: r.display_name,
                kickoff_at: time(&r.kickoff_at)?,
                fixed_wager: r.fixed_wager,
                playoff: r.playoff != 0,
            })
        })
        .collect()
}

fn slots(rows: Vec<SlotRow>) -> Vec<GameSlot> {
    rows.into_iter()
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
        .collect()
}

fn results(rows: Vec<ResultRow>) -> Vec<GameResult> {
    rows.into_iter()
        .map(|r| GameResult {
            game_id: GameId(r.game_id),
            winner_slot_id: SlotId(r.winner_slot_id),
            source: match r.source.as_str() {
                "manual" => ResultSource::Manual,
                "cfbd" => ResultSource::Cfbd,
                _ => ResultSource::Import,
            },
        })
        .collect()
}

fn picks(rows: Vec<PickRow>) -> Vec<Pick> {
    rows.into_iter()
        .map(|r| Pick {
            user_id: UserId(r.user_id),
            game_id: GameId(r.game_id),
            season_id: SeasonId(r.season_id),
            slot_id: r.slot_id.map(SlotId),
            confidence: r.confidence,
        })
        .collect()
}

fn ranks(rows: Vec<RankRow>) -> Vec<PlayoffRank> {
    rows.into_iter()
        .map(|r| PlayoffRank { user_id: UserId(r.user_id), team_season_id: TeamSeasonId(r.team_season_id), rank: r.rank })
        .collect()
}

impl D1Storage {
    async fn query<T: DeserializeOwned>(&self, sql: &str, args: &[JsValue]) -> Result<Vec<T>> {
        self.0.prepare(sql).bind(args)?.all().await?.results()
    }

    /// Run `statements` as one transaction; the last must be the generation
    /// bump, whose row (absent when it matched no season, or
    /// when a picks bump found the new set not written) is returned.
    async fn batch_generation(&self, statements: Vec<D1PreparedStatement>) -> Result<Option<u64>> {
        let results = self.0.batch(statements).await?;
        let rows: Vec<GenerationRow> = results.last().ok_or_else(|| Error::RustError("empty batch".into()))?.results()?;
        Ok(rows.first().map(|r| r.generation))
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
        games(self.query(sql::GAMES_FOR_SEASON, &[num(season.0)]).await?)
    }

    async fn slots_for_season(&self, season: SeasonId) -> Result<Vec<GameSlot>> {
        Ok(slots(self.query(sql::SLOTS_FOR_SEASON, &[num(season.0)]).await?))
    }

    async fn team_seasons_for_season(&self, season: SeasonId) -> Result<Vec<TeamSeason>> {
        let rows: Vec<TeamSeasonRow> = self.query(sql::TEAM_SEASONS_FOR_SEASON, &[num(season.0)]).await?;
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
        Ok(results(self.query(sql::RESULTS_FOR_SEASON, &[num(season.0)]).await?))
    }

    async fn picks_for_season(&self, season: SeasonId) -> Result<Vec<Pick>> {
        Ok(picks(self.query(sql::PICKS_FOR_SEASON, &[num(season.0)]).await?))
    }

    async fn playoff_ranks_for_season(&self, season: SeasonId) -> Result<Vec<PlayoffRank>> {
        Ok(ranks(self.query(sql::PLAYOFF_RANKS_FOR_SEASON, &[num(season.0)]).await?))
    }

    async fn archive(&self) -> Result<Archive> {
        Ok(Archive {
            games: games(self.query(sql::ALL_GAMES, &[]).await?)?,
            slots: slots(self.query(sql::ALL_SLOTS, &[]).await?),
            results: results(self.query(sql::ALL_RESULTS, &[]).await?),
            picks: picks(self.query(sql::ALL_PICKS, &[]).await?),
            ranks: ranks(self.query(sql::ALL_PLAYOFF_RANKS, &[]).await?),
        })
    }

    async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>> {
        let rows: Vec<UserRow> = self.query(sql::USER_BY_EMAIL_HASH, &[hash.as_str().into()]).await?;
        Ok(rows.into_iter().next().map(Into::into))
    }

    async fn users(&self) -> Result<Vec<User>> {
        let rows: Vec<UserRow> = self
            .query(sql::USERS, &[]).await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn picks_version(&self, user: UserId, season: SeasonId) -> Result<Option<String>> {
        let rows: Vec<VersionRow> = self.query(sql::PICKS_VERSION, &[num(user.0), num(season.0)]).await?;
        Ok(rows.into_iter().next().and_then(|r| r.version))
    }

    async fn replace_picks(
        &self,
        user: UserId,
        season: SeasonId,
        picks: &[Pick],
        ranks: &[PlayoffRank],
        version: &str,
        base: Option<&str>,
    ) -> Result<Option<u64>> {
        let base = base.map_or(JsValue::NULL, JsValue::from_str);
        let guard = [num(user.0), num(season.0), base];
        let mut statements = vec![
            self.0.prepare(sql::DELETE_PICKS).bind(&guard)?,
            self.0.prepare(sql::DELETE_RANKS).bind(&guard)?,
        ];
        for p in picks {
            let confidence = p.confidence.map_or(JsValue::NULL, |c| num(c.into()));
            let slot = p.slot_id.map_or(JsValue::NULL, |s| num(s.0));
            let args = [num(user.0), num(p.game_id.0), num(season.0), slot, confidence, version.into()];
            statements.push(self.0.prepare(sql::INSERT_PICK).bind(&args)?);
        }
        for r in ranks {
            let args = [num(user.0), num(season.0), num(r.team_season_id.0), num(r.rank.into()), version.into()];
            statements.push(self.0.prepare(sql::INSERT_RANK).bind(&args)?);
        }
        let bump = [num(season.0), num(user.0), version.into()];
        statements.push(self.0.prepare(sql::BUMP_GENERATION_FOR_PICKS).bind(&bump)?);
        self.batch_generation(statements).await
    }

    async fn record_result(&self, season: SeasonId, result: GameResult) -> Result<u64> {
        let upsert = [num(result.game_id.0), num(result.winner_slot_id.0), result.source.as_str().into()];
        self.batch_generation(vec![
            self.0.prepare(sql::UPSERT_RESULT).bind(&upsert)?,
            self.0.prepare(sql::BUMP_GENERATION).bind(&[num(season.0)])?,
        ])
        .await?
        .ok_or_else(|| Error::RustError("season not found".into()))
    }
}
