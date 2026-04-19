-- 001: unique index on messages.msgid
--
-- Prereq for idempotent db.insertMessage (ON CONFLICT (msgid)).
-- Must be applied BEFORE deploying the matching code change, or the
-- INSERT ... ON CONFLICT clause will fail with "no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- Run order:
--   1. Step A below (audit). If it returns any rows, STOP and resolve
--      the duplicates before proceeding.
--   2. Step B (index creation). Uses CONCURRENTLY to avoid locking the
--      messages table; cannot run inside a transaction.
--
-- To apply:
--   psql "$DATABASE_URL" -f migrations/001_messages_unique_msgid.sql
-- or paste each block interactively.

-- =========================================================================
-- Step A: audit for duplicates. Abort if this returns any rows.
-- =========================================================================
SELECT msgid, COUNT(*) AS n, ARRAY_AGG(id ORDER BY id) AS row_ids
FROM messages
GROUP BY msgid
HAVING COUNT(*) > 1;

-- If rows were returned, manually decide which `id` to keep per msgid
-- (usually the earliest), move or delete the others, then re-run the audit.
-- Only proceed to Step B when the audit returns zero rows.

-- =========================================================================
-- Step B: add the unique index. Safe to re-run (IF NOT EXISTS).
-- =========================================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_msgid_key
    ON messages(msgid);

-- Verify:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'messages';
