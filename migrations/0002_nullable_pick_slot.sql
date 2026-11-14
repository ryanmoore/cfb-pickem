-- A player's list always holds every game, so a pick may exist before its
-- winner is chosen: `slot_id` becomes nullable. SQLite cannot drop NOT NULL in
-- place, hence the rebuild. Nothing references `pick`, so it runs with foreign
-- keys on throughout; dropping the table drops its indexes, recreated below
-- exactly as 0001 defined them.
CREATE TABLE pick_new (
    user_id    INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    game_id    INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
    season_id  INTEGER NOT NULL REFERENCES season(id) ON DELETE CASCADE,
    -- NULL until the player has chosen a winner; such a pick scores nothing.
    slot_id    INTEGER REFERENCES game_slot(id),
    -- NULL exactly when the game carries a fixed wager.
    confidence INTEGER CHECK (confidence IS NULL OR confidence > 0),
    updated_at TEXT    NOT NULL,
    PRIMARY KEY (user_id, game_id)
);

INSERT INTO pick_new (user_id, game_id, season_id, slot_id, confidence, updated_at)
    SELECT user_id, game_id, season_id, slot_id, confidence, updated_at FROM pick;

DROP TABLE pick;
ALTER TABLE pick_new RENAME TO pick;

CREATE UNIQUE INDEX pick_one_confidence_per_season
    ON pick(user_id, season_id, confidence)
    WHERE confidence IS NOT NULL;

CREATE INDEX pick_season_idx ON pick(season_id);
CREATE INDEX pick_game_idx   ON pick(game_id);
