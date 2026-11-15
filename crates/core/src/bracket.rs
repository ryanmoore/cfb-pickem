//! A playoff bracket read off its games.
//!
//! A bracket is a set of games whose slots hold a team or the winner of a
//! feeder game; byes are team slots in a later round. Nothing about the field
//! size or the number of byes is assumed, so every question here is answered
//! by walking that structure.

use std::collections::HashMap;

use crate::model::{GameId, GameResult, GameSlot, SlotId, SlotSource, TeamSeasonId};

/// One playoff team's run through the bracket.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TeamRun {
    pub team: TeamSeasonId,
    pub seed: Option<u16>,
    /// Wins available if it keeps winning from its first game.
    pub max_wins: u32,
    pub wins: u32,
    pub eliminated: bool,
}

impl TeamRun {
    /// Wins it can still earn: none once it has lost.
    pub fn remaining(&self) -> u32 {
        if self.eliminated { 0 } else { self.max_wins.saturating_sub(self.wins) }
    }
}

pub struct Bracket<'a> {
    /// Slots of the bracket's games only.
    slots: Vec<&'a GameSlot>,
    winning_slot: HashMap<GameId, SlotId>,
}

impl<'a> Bracket<'a> {
    /// `slots` and `results` may be supersets; only those of `games` count.
    pub fn new(games: &[GameId], slots: &'a [GameSlot], results: &[GameResult]) -> Self {
        Self {
            slots: slots.iter().filter(|s| games.contains(&s.game_id)).collect(),
            winning_slot: results.iter().map(|r| (r.game_id, r.winner_slot_id)).collect(),
        }
    }

    fn team_in(&self, slot: &GameSlot) -> Option<TeamSeasonId> {
        match slot.source {
            SlotSource::Team { team_season_id } => Some(team_season_id),
            SlotSource::WinnerOf { game_id } => self.winner(game_id),
        }
    }

    /// The team that won `game`, once it is decided and its sides are known.
    pub fn winner(&self, game: GameId) -> Option<TeamSeasonId> {
        let won = self.winning_slot.get(&game)?;
        self.team_in(self.slots.iter().find(|s| s.id == *won)?)
    }

    /// 0 for a game between two teams, else one past its latest feeder.
    pub fn round(&self, game: GameId) -> u32 {
        self.slots
            .iter()
            .filter(|s| s.game_id == game)
            .filter_map(|s| match s.source {
                SlotSource::WinnerOf { game_id } => Some(self.round(game_id) + 1),
                SlotSource::Team { .. } => None,
            })
            .max()
            .unwrap_or(0)
    }

    /// Every team in the bracket, best seed first.
    pub fn runs(&self) -> Vec<TeamRun> {
        let mut runs: Vec<TeamRun> = self
            .slots
            .iter()
            .filter_map(|s| match s.source {
                SlotSource::Team { team_season_id } => Some((team_season_id, s)),
                SlotSource::WinnerOf { .. } => None,
            })
            .map(|(team, first)| {
                let mut max_wins = 0;
                let mut game = Some(first.game_id);
                while let Some(g) = game {
                    max_wins += 1;
                    game = self
                        .slots
                        .iter()
                        .find(|s| s.source == SlotSource::WinnerOf { game_id: g })
                        .map(|s| s.game_id);
                }
                let wins = self.winning_slot.keys().filter(|g| self.winner(**g) == Some(team)).count() as u32;
                let eliminated = self
                    .slots
                    .iter()
                    .filter(|s| self.team_in(s) == Some(team))
                    .any(|s| self.winner(s.game_id).is_some_and(|w| w != team));
                TeamRun { team, seed: first.seed, max_wins, wins, eliminated }
            })
            .collect();
        runs.sort_by_key(|r| (r.seed.is_none(), r.seed, r.team));
        runs
    }
}
