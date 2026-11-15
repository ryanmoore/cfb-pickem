-- Per player and season: whether they confirmed the playoff ranking, and how many
-- saves changed it (a ranking starts complete, so its rows show no activity).
-- Written in the same batch and version check as the picks.
CREATE TABLE player_season (
    user_id          INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    season_id        INTEGER NOT NULL REFERENCES season(id) ON DELETE CASCADE,
    playoff_done_at  TEXT,
    playoff_moves    INTEGER NOT NULL DEFAULT 0 CHECK (playoff_moves >= 0),
    PRIMARY KEY (user_id, season_id)
);
