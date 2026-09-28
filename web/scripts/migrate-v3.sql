-- v3 (2026-09-28): schema completeness + security hardening.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. The app has always written this table, but no migration created it.
CREATE TABLE IF NOT EXISTS conversations (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. One summary per call (the finish route is idempotent; this enforces it).
--    Checked 2026-09-28: production has no duplicate session_ids.
CREATE UNIQUE INDEX IF NOT EXISTS call_summaries_session_id_key ON call_summaries (session_id);

-- 3. Row Level Security on every table, with no policies.
--    The app only uses the service-role key (server-side), which bypasses RLS.
--    With RLS on, the public anon key can no longer read transcripts or caller data.
ALTER TABLE knowledge_base  ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_summaries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE callers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE caller_memories ENABLE ROW LEVEL SECURITY;

-- 4. Vector search is no longer used at runtime (facts live in lib/knowledge.ts), and
--    these ivfflat indexes on tiny tables silently dropped rows anyway.
DROP INDEX IF EXISTS idx_knowledge_base_embedding;
DROP INDEX IF EXISTS idx_caller_memories_embedding;
