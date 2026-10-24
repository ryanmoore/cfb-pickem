# 0001 — Remodel the schema for brackets and email identity

Date: 2026-08-03
Status: Accepted

## Context

The schema carried forward from the Django app had been stable since 2017 and
described the sport as it was then: a fixed set of bowl games, each between two
known teams, with a four-team playoff bolted on as three ordinary games.

Three things forced a remodel rather than a port.

**The playoff is now a bracket.** A twelve-team playoff has games whose
participants are not known when the bracket is published — a quarter-final is
between a first-round winner and a seeded team. The old `participant` table
joined a game to a `team_season` and had no way to express "whoever wins game
X", so the structure could not be stored at all until the feeder game finished.

**Bowl names are not identities.** `event` used the bowl's name as its primary
key. Sponsorship changes the name most years, and the schedule data the names
came from was inconsistent about capitalisation and sponsor suffixes, so the
same bowl accumulated several primary keys over the archive. Anything keyed on
event identity across seasons was therefore unreliable.

**Identity moves to email.** Authentication is handled by a proxy that asserts
a verified email address rather than by the application, so accounts key on
email instead of a local username and password. That raised a second question:
whether to store the addresses. Nothing in the application reads one back — a
request arrives carrying a verified address and the only operation is finding
the matching account, which is a comparison. Backups of the database leave the
platform, so storing addresses would put personal data in a second system to
protect.

Two further problems were visible in the existing data and cheap to fix while
remodelling:

- A pick was split across two tables — one row recording which side a player
  took, another recording how many points they staked, keyed differently. A
  player could hold one without the other.
- A game's winner was a row in a `winner` table with nothing preventing two of
  them; uniqueness was enforced by an application-level validator.

## Decision

- **`event` gets a surrogate key**, with per-season naming on
  `game.display_name`, so the same bowl keeps one identity across renames.
- **`game_slot` replaces `participant`.** A slot resolves either to a
  `team_season` or to a feeder game, enforced as exactly-one by a `CHECK`, so a
  bracket can be stored before its later rounds have participants.
- **`pick` merges the two halves into one row** keyed by `(user_id, game_id)`,
  making a half-entered pick unrepresentable.
- **`game_result` is keyed by game**, so at most one winner per game is
  structural.
- **`app_user` keys on a keyed digest of the email**, not the address.
  Canonicalise (trim, lowercase), then HMAC-SHA256 under a key held in platform
  secrets and never in the database. An unkeyed digest would not do: addresses
  are guessable, so a plain hash of one is checkable offline in milliseconds.
  `legacy_username` is retained for provenance.
- **`pick.season_id` is denormalised** from `game.season_id`, solely so a
  partial unique index on `(user_id, season_id, confidence)` can enforce that a
  player never spends the same confidence value twice in a season.

## Consequences

Confidence values across a season form a strict permutation of `1..=N`. The
uniqueness half is now a database constraint; completeness — that the values
used are exactly `1..=N` with no gaps — still spans rows and is checked in
`core::scoring::validate_confidence_permutation`.

`fixed_wager` stays a per-game nullable amount rather than a per-season
setting, because the number is chosen per season and does not follow from the
number of games. Deriving it would mis-score archived seasons that chose
otherwise, so it is stored rather than computed.

The denormalised `pick.season_id` is a real redundancy that writes must keep
consistent with `game.season_id`. It was accepted because the alternative
leaves duplicate-confidence detection entirely to application code.

`email_hash` is nullable. Almost none of the archive's accounts carried an
email, so imported users arrive without a digest and cannot sign in until an
address is attached, which is a manual step.

Hashing identity is awkward to reverse in three ways:

- **The application cannot send mail.** Reminders or notifications would need
  addresses collected again and stored somewhere.
- **Losing the key orphans every account.** Each user is re-matched only when
  they next sign in and their address hashes to a new digest. The key needs
  backing up separately from the database; storing both together protects
  neither.
- **Rotation is lazy rather than atomic.** Existing digests cannot be
  recomputed without the addresses, so a new key takes effect per user at next
  sign-in, matching the old digest first and rewriting it.

`display_name` stays in plaintext. Standings are unusable without it, and it
keeps rows identifiable for administration once addresses are not stored.

Canonicalisation lives in the shared core rather than in each storage adapter.
If adapters lowercased differently, one person would resolve to two identities
depending on which backend served the request.
