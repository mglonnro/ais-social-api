-- Track in-flight topdown regenerations so the client can poll for state
-- and refresh the map icon as soon as a fresh PNG is available.
-- NULL = idle / no attempt in progress, 'rendering' = generation in flight,
-- 'failed' = last attempt failed (preserves the previous topdown_uri if any).

ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS topdown_status TEXT;
