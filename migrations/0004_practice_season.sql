-- Practice seasons play like any other but stay out of history and all-time
-- stats. Existing seasons are real.
ALTER TABLE season ADD COLUMN practice INTEGER NOT NULL DEFAULT 0 CHECK (practice IN (0, 1));
