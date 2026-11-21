-- How a team looks on the pick page: its mascot and two colors (#rrggbb).
-- Season documents validate the format; unset means unknown.
ALTER TABLE team ADD COLUMN mascot TEXT;
ALTER TABLE team ADD COLUMN color TEXT;
ALTER TABLE team ADD COLUMN alt_color TEXT;
