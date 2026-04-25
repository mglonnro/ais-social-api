-- Columns for AI-generated top-down boat icons.
-- topdown_uri: public GCS URL of the PNG
-- topdown_length_m / topdown_beam_m: AIS dimensions used at generation time;
--   persisted so the map client can size the icon to the real footprint
--   without re-fetching the live AIS record.

ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS topdown_uri TEXT,
  ADD COLUMN IF NOT EXISTS topdown_length_m REAL,
  ADD COLUMN IF NOT EXISTS topdown_beam_m REAL;
