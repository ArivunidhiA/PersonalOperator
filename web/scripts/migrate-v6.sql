-- v5: share links expire. Run once in the Supabase SQL editor. Safe to re-run. Additive only.
-- migrate-v2.sql already created share_tokens.expires_at; this makes sure older databases have it
-- and backfills links that never got an expiry (30 days from creation).
ALTER TABLE share_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days');
UPDATE share_tokens SET expires_at = created_at + interval '30 days' WHERE expires_at IS NULL;
