-- Playoff ranking format. `'fixed'` seasons pick their playoff games by slot
-- like any other game; `'rank'` seasons have players rank every playoff team
-- and score through its wins. Existing seasons stay `'fixed'`.
ALTER TABLE season ADD COLUMN playoff_format TEXT NOT NULL DEFAULT 'fixed'
    CHECK (playoff_format IN ('fixed', 'rank'));

-- Marks a bracket's games; in a `'rank'` season they take no picks.
ALTER TABLE game ADD COLUMN playoff INTEGER NOT NULL DEFAULT 0 CHECK (playoff IN (0, 1));

-- One row per team in a player's ranking, N for the most confident down to 1.
-- That the ranks are exactly 1..N over the season's playoff teams spans rows
-- and is checked in core::scoring::validate_ranking. `season_id` is
-- denormalised for the index. A player's picks and ranking share one version
-- (`updated_at`), written in one batch.
CREATE TABLE playoff_rank (
    user_id        INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    season_id      INTEGER NOT NULL REFERENCES season(id) ON DELETE CASCADE,
    team_season_id INTEGER NOT NULL REFERENCES team_season(id) ON DELETE CASCADE,
    rank           INTEGER NOT NULL CHECK (rank > 0),
    updated_at     TEXT    NOT NULL,
    PRIMARY KEY (user_id, team_season_id)
);

CREATE UNIQUE INDEX playoff_rank_one_rank_per_season ON playoff_rank(user_id, season_id, rank);
CREATE INDEX playoff_rank_season_idx ON playoff_rank(season_id);
