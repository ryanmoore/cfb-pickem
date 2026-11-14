//! Scoring and pick validation.
//!
//! Two rules the type system cannot express:
//!
//! - A player's confidence values across a season are a strict permutation of
//!   `1..=N`, where N counts the season's games without a fixed wager. It is a
//!   ranking, not N independent numbers.
//! - At most one game per season carries a fixed wager instead. Its amount is
//!   chosen per season and is not derivable from N.

use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::model::{Game, GameId, GameResult, Pick, UserId};

/// A player's position: points banked, and points still reachable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Standing {
    pub user_id: UserId,
    pub scored: u32,
    pub remaining: u32,
}

impl Standing {
    /// What this player finishes on if every undecided game they picked goes
    /// their way.
    pub fn max_possible(&self) -> u32 {
        self.scored + self.remaining
    }
}

/// Compute standings for one season.
///
/// Games absent from `games` are ignored, so `picks` and `results` may be
/// supersets.
pub fn standings(games: &[Game], picks: &[Pick], results: &[GameResult]) -> Vec<Standing> {
    let games_by_id: HashMap<GameId, &Game> = games.iter().map(|g| (g.id, g)).collect();
    let winners: HashMap<GameId, _> = results
        .iter()
        .map(|r| (r.game_id, r.winner_slot_id))
        .collect();

    let mut totals: HashMap<UserId, Standing> = HashMap::new();

    for pick in picks {
        let Some(game) = games_by_id.get(&pick.game_id) else {
            continue;
        };
        // A confidence game with no value assigned is a validation failure;
        // scoring does not substitute one.
        let Some(wager) = game.wager_for(pick.confidence) else {
            continue;
        };

        let entry = totals.entry(pick.user_id).or_insert(Standing {
            user_id: pick.user_id,
            scored: 0,
            remaining: 0,
        });

        if pick.slot_id.is_none() {
            continue; // no side chosen: scores nothing and keeps nothing in play
        }
        match winners.get(&pick.game_id) {
            Some(winning_slot) if Some(*winning_slot) == pick.slot_id => entry.scored += wager,
            Some(_) => {} // picked the losing side: nothing banked, nothing left
            None => entry.remaining += wager,
        }
    }

    let mut out: Vec<Standing> = totals.into_values().collect();
    // Leader first, ties broken by who has the most still in play, then by id
    // so the order is stable.
    out.sort_by(|a, b| {
        b.scored
            .cmp(&a.scored)
            .then(b.remaining.cmp(&a.remaining))
            .then(a.user_id.cmp(&b.user_id))
    });
    out
}

/// Competition ranks (1, 1, 3) for entries already sorted best first, given
/// each entry's `(scored, max_possible)`; entries tie when both match.
pub fn rank_ties(points: &[(u32, u32)]) -> Vec<u32> {
    let mut ranks: Vec<u32> = Vec::with_capacity(points.len());
    for (i, p) in points.iter().enumerate() {
        ranks.push(match i.checked_sub(1) {
            Some(prev) if points[prev] == *p => ranks[prev],
            _ => i as u32 + 1,
        });
    }
    ranks
}

/// Every way a player's confidence assignment can be wrong.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[serde(rename_all = "snake_case", tag = "problem")]
pub enum PermutationError {
    #[error("game {game_id} is missing from the entry")]
    MissingPick { game_id: GameId },
    #[error("game {game_id} takes a fixed wager, so it must not carry a confidence value")]
    UnexpectedConfidence { game_id: GameId },
    #[error("game {game_id} needs a confidence value")]
    MissingConfidence { game_id: GameId },
    #[error("confidence {value} is outside 1..={max}")]
    OutOfRange { value: u32, max: u32 },
    #[error("confidence {value} is used more than once")]
    Duplicate { value: u32 },
    #[error("confidence {value} is never used")]
    Unused { value: u32 },
}

/// Check one player's picks for one season against the permutation rule.
///
/// Reports every problem rather than the first: callers surface these to a
/// person correcting an entry, who needs the whole set to fix it in one pass.
pub fn validate_confidence_permutation(
    games: &[Game],
    picks: &[Pick],
) -> Result<(), Vec<PermutationError>> {
    let mut problems = Vec::new();
    let picks_by_game: HashMap<GameId, &Pick> = picks.iter().map(|p| (p.game_id, p)).collect();

    let confidence_games: Vec<&Game> = games.iter().filter(|g| g.fixed_wager.is_none()).collect();
    let expected_max = confidence_games.len() as u32;

    let mut seen: BTreeSet<u32> = BTreeSet::new();

    for game in games {
        let Some(pick) = picks_by_game.get(&game.id) else {
            problems.push(PermutationError::MissingPick { game_id: game.id });
            continue;
        };

        match (game.fixed_wager, pick.confidence) {
            (Some(_), Some(_)) => {
                problems.push(PermutationError::UnexpectedConfidence { game_id: game.id })
            }
            (None, None) => {
                problems.push(PermutationError::MissingConfidence { game_id: game.id })
            }
            (None, Some(value)) => {
                if value == 0 || value > expected_max {
                    problems.push(PermutationError::OutOfRange {
                        value,
                        max: expected_max,
                    });
                } else if !seen.insert(value) {
                    problems.push(PermutationError::Duplicate { value });
                }
            }
            (Some(_), None) => {}
        }
    }

    // Gaps are only meaningful once the in-range values are known.
    for value in 1..=expected_max {
        if !seen.contains(&value) {
            problems.push(PermutationError::Unused { value });
        }
    }

    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{GameId, SeasonId, SlotId, UserId};
    use chrono::{DateTime, Utc};

    fn ts() -> DateTime<Utc> {
        "2026-12-20T17:00:00Z".parse().unwrap()
    }

    fn game(id: i64, fixed: Option<u32>) -> Game {
        Game {
            id: GameId(id),
            season_id: SeasonId(1),
            event_id: crate::model::EventId(id),
            display_name: None,
            kickoff_at: ts(),
            fixed_wager: fixed,
        }
    }

    fn pick(user: i64, game: i64, slot: i64, confidence: Option<u32>) -> Pick {
        Pick {
            user_id: UserId(user),
            game_id: GameId(game),
            season_id: SeasonId(1),
            slot_id: Some(SlotId(slot)),
            confidence,
        }
    }

    fn won(game: i64, slot: i64) -> GameResult {
        GameResult {
            game_id: GameId(game),
            winner_slot_id: SlotId(slot),
            source: crate::model::ResultSource::Manual,
        }
    }

    #[test]
    fn scores_confidence_games_and_banks_only_correct_picks() {
        let games = vec![game(1, None), game(2, None)];
        let picks = vec![pick(10, 1, 100, Some(2)), pick(10, 2, 200, Some(1))];
        // Won game 1, lost game 2.
        let results = vec![won(1, 100), won(2, 201)];

        let s = standings(&games, &picks, &results);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].scored, 2);
        assert_eq!(s[0].remaining, 0);
    }

    #[test]
    fn undecided_games_count_as_remaining_not_scored() {
        let games = vec![game(1, None), game(2, None)];
        let picks = vec![pick(10, 1, 100, Some(2)), pick(10, 2, 200, Some(1))];
        let results = vec![won(1, 100)]; // game 2 still to play

        let s = standings(&games, &picks, &results);
        assert_eq!(s[0].scored, 2);
        assert_eq!(s[0].remaining, 1);
        assert_eq!(s[0].max_possible(), 3);
    }

    #[test]
    fn fixed_wager_game_scores_its_own_amount_ignoring_confidence() {
        // A fixed wager can exceed the top confidence value available.
        let games = vec![game(1, None), game(2, Some(24))];
        let picks = vec![pick(10, 1, 100, Some(1)), pick(10, 2, 200, None)];
        let results = vec![won(1, 100), won(2, 200)];

        let s = standings(&games, &picks, &results);
        assert_eq!(s[0].scored, 25);
    }

    #[test]
    fn standings_are_ordered_by_score_then_by_what_is_still_in_play() {
        let games = vec![game(1, None), game(2, None)];
        let results = vec![won(1, 100)];
        let picks = vec![
            // Both banked 2; user 11 has more still reachable.
            pick(10, 1, 100, Some(2)),
            pick(10, 2, 200, Some(1)),
            pick(11, 1, 100, Some(2)),
            pick(11, 2, 201, Some(1)),
        ];
        // Give 11 a larger remaining by making its second pick worth more.
        let picks: Vec<Pick> = picks
            .into_iter()
            .map(|mut p| {
                if p.user_id == UserId(11) && p.game_id == GameId(2) {
                    p.confidence = Some(2);
                }
                p
            })
            .collect();

        let s = standings(&games, &picks, &results);
        assert_eq!(s[0].user_id, UserId(11));
        assert_eq!(s[1].user_id, UserId(10));
    }

    #[test]
    fn a_complete_permutation_validates() {
        let games = vec![game(1, None), game(2, None), game(3, Some(19))];
        let picks = vec![
            pick(10, 1, 100, Some(1)),
            pick(10, 2, 200, Some(2)),
            pick(10, 3, 300, None),
        ];
        assert!(validate_confidence_permutation(&games, &picks).is_ok());
    }

    #[test]
    fn duplicate_confidence_leaves_a_gap_and_reports_both() {
        let games = vec![game(1, None), game(2, None)];
        let picks = vec![pick(10, 1, 100, Some(1)), pick(10, 2, 200, Some(1))];

        let problems = validate_confidence_permutation(&games, &picks).unwrap_err();
        assert!(problems.contains(&PermutationError::Duplicate { value: 1 }));
        assert!(problems.contains(&PermutationError::Unused { value: 2 }));
    }

    #[test]
    fn confidence_on_a_fixed_wager_game_is_rejected() {
        let games = vec![game(1, None), game(2, Some(19))];
        let picks = vec![pick(10, 1, 100, Some(1)), pick(10, 2, 200, Some(2))];

        let problems = validate_confidence_permutation(&games, &picks).unwrap_err();
        assert!(problems.contains(&PermutationError::UnexpectedConfidence {
            game_id: GameId(2)
        }));
    }

    #[test]
    fn out_of_range_confidence_is_rejected_against_the_confidence_game_count() {
        // Three games but one is fixed-wager, so the range is 1..=2.
        let games = vec![game(1, None), game(2, None), game(3, Some(19))];
        let picks = vec![
            pick(10, 1, 100, Some(3)),
            pick(10, 2, 200, Some(1)),
            pick(10, 3, 300, None),
        ];

        let problems = validate_confidence_permutation(&games, &picks).unwrap_err();
        assert!(problems.contains(&PermutationError::OutOfRange { value: 3, max: 2 }));
    }
}
