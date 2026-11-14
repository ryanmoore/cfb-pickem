//! Domain types.
//!
//! Identifiers are newtypes so an id for one entity cannot be passed where
//! another's is expected.

use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

macro_rules! id_type {
    ($($(#[$m:meta])* $name:ident),* $(,)?) => { $(
        $(#[$m])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub i64);

        impl core::fmt::Display for $name {
            fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                self.0.fmt(f)
            }
        }
    )* };
}

id_type!(UserId, SeasonId, EventId, TeamId, TeamSeasonId, GameId, SlotId);

/// A keyed digest of an email address.
///
/// Addresses are never stored, only compared: a request carries a verified
/// address, which is canonicalised and hashed to produce this. The key is held
/// outside the database, so a copy of the data alone does not yield addresses.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct EmailHash(String);

impl EmailHash {
    /// Encode the bytes an HMAC produced over [`canonical_email`] output.
    ///
    /// The field is private and this is the only constructor so that the
    /// encoding cannot differ between storage backends; two encodings of one
    /// address would resolve to two accounts.
    pub fn from_digest(digest: &[u8]) -> Self {
        let mut s = String::with_capacity(digest.len() * 2);
        for byte in digest {
            // Push nibbles rather than formatting, so the conversion stays
            // infallible and always emits two characters per byte.
            s.push(char::from_digit((byte >> 4) as u32, 16).unwrap());
            s.push(char::from_digit((byte & 0x0f) as u32, 16).unwrap());
        }
        Self(s)
    }

    /// Reconstruct from a previously encoded value read out of storage.
    pub fn from_encoded(encoded: String) -> Self {
        Self(encoded)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl core::fmt::Display for EmailHash {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        self.0.fmt(f)
    }
}

/// Reduce an address to the form that gets hashed.
///
/// Lives here rather than in the adapters because both must apply it
/// identically; diverging would give one person two identities depending on
/// which backend handled the request.
pub fn canonical_email(raw: &str) -> String {
    raw.trim().to_lowercase()
}

/// The digest stored for an address: HMAC-SHA256 under `key` of the
/// canonical form.
pub fn email_hash(key: &[u8], raw: &str) -> EmailHash {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(canonical_email(raw).as_bytes());
    EmailHash::from_digest(&mac.finalize().into_bytes())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: UserId,
    /// `None` until an address is attached; such an account cannot sign in.
    pub email_hash: Option<EmailHash>,
    pub display_name: String,
    pub is_admin: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Season {
    pub id: SeasonId,
    pub year: u16,
    /// Picks are immutable from this instant.
    pub locks_at: DateTime<Utc>,
    /// Bumped by any write that changes derived data. Cacheable responses are
    /// addressed by it, so stale entries are superseded rather than purged.
    pub generation: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub id: EventId,
    pub name: String,
}

/// A team as it stood in one season.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TeamSeason {
    pub id: TeamSeasonId,
    pub name: String,
    pub rank: Option<u32>,
    pub record: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Game {
    pub id: GameId,
    pub season_id: SeasonId,
    pub event_id: EventId,
    /// Set when this season's name for the event differs from the canonical
    /// one, as sponsorship changes cause.
    pub display_name: Option<String>,
    pub kickoff_at: DateTime<Utc>,
    /// `None`: each player assigns this game a confidence value.
    /// `Some(n)`: every player scores `n` and assigns no confidence.
    ///
    /// The amount is chosen per season and is not derivable from the number
    /// of games.
    pub fixed_wager: Option<u32>,
}

impl Game {
    /// What this game is worth to a player who picked its winner.
    ///
    /// `None` when a confidence game has no value assigned.
    pub fn wager_for(&self, confidence: Option<u32>) -> Option<u32> {
        match self.fixed_wager {
            Some(fixed) => Some(fixed),
            None => confidence,
        }
    }
}

/// One side of a matchup, which need not be a known team yet.
///
/// Bracket games are filled by the winners of earlier games, so a slot
/// resolves either to a team or to a reference to a feeder game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameSlot {
    pub id: SlotId,
    pub game_id: GameId,
    pub slot_index: u8,
    pub source: SlotSource,
    pub seed: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum SlotSource {
    Team { team_season_id: TeamSeasonId },
    WinnerOf { game_id: GameId },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameResult {
    pub game_id: GameId,
    pub winner_slot_id: SlotId,
    pub source: ResultSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResultSource {
    Manual,
    Cfbd,
    Import,
}

impl ResultSource {
    /// The value stored in `game_result.source`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Cfbd => "cfbd",
            Self::Import => "import",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pick {
    pub user_id: UserId,
    pub game_id: GameId,
    pub season_id: SeasonId,
    /// Which side the player took.
    pub slot_id: SlotId,
    /// `None` exactly when the game carries a fixed wager.
    pub confidence: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digests_encode_as_lowercase_hex_preserving_leading_zeros() {
        let hash = EmailHash::from_digest(&[0x00, 0x0f, 0xa5, 0xff]);
        assert_eq!(hash.as_str(), "000fa5ff");
    }

    #[test]
    fn email_hash_is_keyed_and_canonical() {
        // HMAC-SHA256("key", "a@b.c"), checked against `openssl dgst -sha256 -hmac key`.
        assert_eq!(
            email_hash(b"key", " A@B.c ").as_str(),
            "39ae49c50426b2bd08543508b376ed900cccf8729da709864ff1e0ef842c25b6"
        );
        assert_ne!(email_hash(b"key", "a@b.c"), email_hash(b"other", "a@b.c"));
    }

    #[test]
    fn canonicalisation_folds_case_and_surrounding_space() {
        assert_eq!(
            canonical_email("  A.Player@Example.COM "),
            "a.player@example.com"
        );
    }
}
