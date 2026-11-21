-- The schedule source's id for a game, set when a season is loaded from a
-- season document; legacy and practice games have none.
ALTER TABLE game ADD COLUMN external_id INTEGER;
CREATE UNIQUE INDEX game_external_id_unique ON game(external_id) WHERE external_id IS NOT NULL;

-- A draft season is visible to admins only until published. Existing seasons
-- are live.
ALTER TABLE season ADD COLUMN draft INTEGER NOT NULL DEFAULT 0 CHECK (draft IN (0, 1));
