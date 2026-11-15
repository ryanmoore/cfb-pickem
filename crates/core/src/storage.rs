//! The seam between the rules and wherever the data happens to live.
//!
//! `worker` implements this over D1 and is what CI deploys; `devserver`
//! implements it over a local SQLite file and is what runs in development.
//! Because both sit behind this one trait, the two build paths differ only in
//! their adapter — there is no second copy of the rules to drift.

use crate::model::{EmailHash, Event, Game, GameResult, GameSlot, Pick, PlayoffRank, PlayoffSave, PlayoffStatus, Season, SeasonId, TeamSeason, User, UserId};

/// Every season's games, results, picks and rankings, as the per-season reads
/// below would return them.
pub struct Archive {
    pub games: Vec<Game>,
    pub slots: Vec<GameSlot>,
    pub results: Vec<GameResult>,
    pub picks: Vec<Pick>,
    pub ranks: Vec<PlayoffRank>,
}

/// Reads and writes the app needs.
///
/// `async fn` in a trait yields a non-`Send` future, which is correct here:
/// Workers isolates are single-threaded and the dev server is too.
#[allow(async_fn_in_trait)]
pub trait Storage {
    type Error: core::fmt::Debug;

    async fn seasons(&self) -> Result<Vec<Season>, Self::Error>;
    async fn season_by_year(&self, year: u16) -> Result<Option<Season>, Self::Error>;

    async fn games_for_season(&self, season: SeasonId) -> Result<Vec<Game>, Self::Error>;
    async fn slots_for_season(&self, season: SeasonId) -> Result<Vec<GameSlot>, Self::Error>;
    async fn team_seasons_for_season(&self, season: SeasonId) -> Result<Vec<TeamSeason>, Self::Error>;
    async fn events(&self) -> Result<Vec<Event>, Self::Error>;
    async fn results_for_season(&self, season: SeasonId) -> Result<Vec<GameResult>, Self::Error>;

    /// Every player's picks for the season — standings need all of them, and
    /// a pool's player count stays small enough that this beats per-user
    /// queries.
    async fn picks_for_season(&self, season: SeasonId) -> Result<Vec<Pick>, Self::Error>;

    /// Everything scoring needs for every season, in a fixed number of
    /// queries: Workers cap the queries one request may make.
    async fn archive(&self) -> Result<Archive, Self::Error>;

    /// Takes a digest rather than an address: the adapter hashes the verified
    /// address from the request before it reaches storage.
    async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>, Self::Error>;
    async fn users(&self) -> Result<Vec<User>, Self::Error>;

    /// Every player's playoff ranking for the season.
    async fn playoff_ranks_for_season(&self, season: SeasonId) -> Result<Vec<PlayoffRank>, Self::Error>;

    /// Each player's confirmation and change count for the season; players who
    /// never saved have no entry.
    async fn playoff_status_for_season(&self, season: SeasonId) -> Result<Vec<PlayoffStatus>, Self::Error>;

    /// The version of a player's picks and ranking for a season; `None` when
    /// they have neither.
    async fn picks_version(&self, user: UserId, season: SeasonId) -> Result<Option<String>, Self::Error>;

    /// Replace a player's picks and playoff ranking for a season with a set
    /// stamped `version`, atomically, and record what the save says about the
    /// ranking (`playoff`). With `base` given, nothing changes
    /// unless it is the player's current version (the empty string when they
    /// have none); that is `Ok(None)`.
    ///
    /// Returns the season's new generation, so the caller can use it
    /// directly for read-your-own-writes instead of re-reading the pointer,
    /// which may not have propagated yet.
    async fn replace_picks(
        &self,
        user: UserId,
        season: SeasonId,
        picks: &[Pick],
        ranks: &[PlayoffRank],
        playoff: PlayoffSave,
        version: &str,
        base: Option<&str>,
    ) -> Result<Option<u64>, Self::Error>;

    /// Record a winner and bump the season's generation in one transaction.
    async fn record_result(&self, season: SeasonId, result: GameResult) -> Result<u64, Self::Error>;
}
