-- Initial schema. See adr/0001-schema-remodel.md for why this differs from
-- the shape it replaces.

PRAGMA foreign_keys = ON;

-- Identity is keyed on a keyed digest of the verified email asserted by the
-- authenticating proxy, never the address itself. The key is held outside the
-- database, so a copy of this table — including a backup — yields no
-- addresses. Nothing reads an address back: authentication supplies one and
-- this compares against it.
--
-- Consequence to know before changing: the application cannot send mail, and
-- replacing the key forces every account to be re-matched at next sign-in.
-- `legacy_username` records the account an imported row came from. Imported
-- rows have no digest until an address is attached, hence nullable (UNIQUE
-- permits any number of NULLs); such an account cannot sign in.
CREATE TABLE app_user (
    id              INTEGER PRIMARY KEY,
    email_hash      TEXT    UNIQUE,
    display_name    TEXT    NOT NULL,
    is_admin        INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    legacy_username TEXT    UNIQUE,
    created_at      TEXT    NOT NULL
);

-- `generation` is authoritative here so it can be bumped in the same
-- transaction as the write that invalidates. It is mirrored to KV after
-- commit for the read path, which must not touch D1 — reads have to survive
-- an export, during which D1 cannot serve queries.
CREATE TABLE season (
    id         INTEGER PRIMARY KEY,
    year       INTEGER NOT NULL UNIQUE,
    locks_at   TEXT    NOT NULL,
    generation INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL
);

-- Events keep a surrogate key: sponsorship renames a bowl without changing
-- which bowl it is, so per-season naming belongs on `game.display_name`.
CREATE TABLE event (
    id   INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE team (
    id   INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE team_season (
    id        INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES season(id) ON DELETE CASCADE,
    team_id   INTEGER NOT NULL REFERENCES team(id),
    rank      INTEGER,
    record    TEXT,
    UNIQUE (season_id, team_id)
);

CREATE TABLE game (
    id           INTEGER PRIMARY KEY,
    season_id    INTEGER NOT NULL REFERENCES season(id) ON DELETE CASCADE,
    event_id     INTEGER NOT NULL REFERENCES event(id),
    display_name TEXT,
    kickoff_at   TEXT    NOT NULL,
    -- NULL: every player assigns this game a confidence value.
    -- SET:  every player scores this amount and assigns no confidence.
    --
    -- The amount is chosen per season and is not derivable from the number of
    -- games; deriving it will mis-score seasons that chose otherwise.
    fixed_wager  INTEGER CHECK (fixed_wager IS NULL OR fixed_wager > 0),
    UNIQUE (season_id, event_id)
);

CREATE INDEX game_season_idx ON game(season_id);

-- A slot resolves either to a concrete team or to the winner of an earlier
-- game, so a bracket can be stored before its later rounds have
-- participants.
CREATE TABLE game_slot (
    id             INTEGER PRIMARY KEY,
    game_id        INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
    slot_index     INTEGER NOT NULL CHECK (slot_index IN (0, 1)),
    team_season_id INTEGER REFERENCES team_season(id),
    feeder_game_id INTEGER REFERENCES game(id),
    seed           INTEGER,
    UNIQUE (game_id, slot_index),
    -- Exactly one of the two is set (`<>` is XOR over 0/1).
    CHECK ((team_season_id IS NOT NULL) <> (feeder_game_id IS NOT NULL))
);

CREATE INDEX game_slot_game_idx   ON game_slot(game_id);
CREATE INDEX game_slot_feeder_idx ON game_slot(feeder_game_id);

-- Keyed by game, so "a game has at most one winner" holds structurally rather
-- than by validation.
CREATE TABLE game_result (
    game_id        INTEGER PRIMARY KEY REFERENCES game(id) ON DELETE CASCADE,
    winner_slot_id INTEGER NOT NULL REFERENCES game_slot(id),
    source         TEXT    NOT NULL CHECK (source IN ('manual', 'cfbd', 'import')),
    recorded_at    TEXT    NOT NULL
);

-- One row per user per game holds the side taken and the points staked
-- together, so a pick missing either half is unrepresentable.
--
-- `season_id` is denormalised only to make the partial index below possible;
-- it must always equal `game.season_id`.
CREATE TABLE pick (
    user_id    INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    game_id    INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
    season_id  INTEGER NOT NULL REFERENCES season(id) ON DELETE CASCADE,
    slot_id    INTEGER NOT NULL REFERENCES game_slot(id),
    -- NULL exactly when the game carries a fixed wager.
    confidence INTEGER CHECK (confidence IS NULL OR confidence > 0),
    updated_at TEXT    NOT NULL,
    PRIMARY KEY (user_id, game_id)
);

-- Half the permutation rule: a player cannot spend the same confidence value
-- twice in a season. That the values are exactly 1..N with no gaps spans rows
-- and is checked in core::scoring::validate_confidence_permutation.
CREATE UNIQUE INDEX pick_one_confidence_per_season
    ON pick(user_id, season_id, confidence)
    WHERE confidence IS NOT NULL;

CREATE INDEX pick_season_idx ON pick(season_id);
CREATE INDEX pick_game_idx   ON pick(game_id);
