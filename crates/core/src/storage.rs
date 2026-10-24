//! The seam between the rules and wherever the data happens to live.
//!
//! `worker` implements this over D1 and is what CI deploys; `devserver`
//! implements it over a local SQLite file and is what runs in development.
//! Because both sit behind this one trait, the two build paths differ only in
//! their adapter — there is no second copy of the rules to drift.

use crate::model::{EmailHash, Game, GameResult, GameSlot, Pick, Season, SeasonId, User, UserId};

/// Reads and writes the app needs.
///
/// `async fn` in a trait yields a non-`Send` future, which is correct here:
/// Workers isolates are single-threaded and the dev server is too.
#[allow(async_fn_in_trait)]
pub trait Storage {
    type Error: core::fmt::Debug;

    async fn season_by_year(&self, year: u16) -> Result<Option<Season>, Self::Error>;

    async fn games_for_season(&self, season: SeasonId) -> Result<Vec<Game>, Self::Error>;
    async fn slots_for_season(&self, season: SeasonId) -> Result<Vec<GameSlot>, Self::Error>;
    async fn results_for_season(&self, season: SeasonId) -> Result<Vec<GameResult>, Self::Error>;

    /// Every player's picks for the season — standings need all of them, and
    /// a pool's player count stays small enough that this beats per-user
    /// queries.
    async fn picks_for_season(&self, season: SeasonId) -> Result<Vec<Pick>, Self::Error>;

    /// Takes a digest rather than an address: the adapter hashes the verified
    /// address from the request before it reaches storage.
    async fn user_by_email_hash(&self, hash: &EmailHash) -> Result<Option<User>, Self::Error>;
    async fn users(&self) -> Result<Vec<User>, Self::Error>;

    /// Replace a player's picks for a season, atomically.
    ///
    /// Returns the season's new generation, so the caller can use it
    /// directly for read-your-own-writes instead of re-reading the pointer,
    /// which may not have propagated yet.
    async fn replace_picks(
        &self,
        user: UserId,
        season: SeasonId,
        picks: &[Pick],
    ) -> Result<u64, Self::Error>;

    /// Record a winner and bump the season's generation in one transaction.
    async fn record_result(&self, result: GameResult) -> Result<u64, Self::Error>;
}
