-- Allow anonymous users keyed by a per-install device UUID. They live in
-- the same `users` table as everyone else; sign-in upgrades the existing
-- row by setting apple_id/google_id rather than creating a new one. This
-- keeps scores, media, getUserSpotted, and friends entirely unchanged.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Partial unique: many real-account users have NULL device_id, only the
-- non-null values must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS users_device_id_unique
  ON users (device_id) WHERE device_id IS NOT NULL;
