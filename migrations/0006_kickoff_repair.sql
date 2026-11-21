-- The legacy app stored many 2022 and 2023 kickoffs twelve hours early, and the
-- practice seasons copied 2023's. Real kickoffs fall between 16:00 and 03:00
-- UTC, so a stored hour of 04 to 15 marks a wrong row and a shifted row no
-- longer matches: running this twice changes nothing.
UPDATE game
SET kickoff_at = strftime('%Y-%m-%dT%H:%M:%SZ', kickoff_at, '+12 hours')
WHERE season_id IN (SELECT id FROM season WHERE year IN (2022, 2023, 8823, 9923))
  AND CAST(substr(kickoff_at, 12, 2) AS INTEGER) BETWEEN 4 AND 15;
