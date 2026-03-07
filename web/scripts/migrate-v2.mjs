// V2 migration: hybrid RAG, semantic memory, share tokens, follow-up tracking
// Run: node scripts/migrate-v2.mjs
// Or copy the SQL and run in Supabase SQL Editor

import { config } from "dotenv";
config({ path: ".env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const SQL = `
-- ============================================================
-- V2 MIGRATION: Hybrid RAG, Semantic Memory, Share Tokens
-- ============================================================

-- 1. Hybrid RAG: Add full-text search column to knowledge_base
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_fts ON knowledge_base USING gin(fts);

-- Hybrid search: combines semantic (pgvector) + keyword (tsvector) with RRF
CREATE OR REPLACE FUNCTION match_knowledge_hybrid(
  query_text TEXT,
  query_embedding vector(1536),
  semantic_weight FLOAT DEFAULT 0.6,
  keyword_weight FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  score FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  rrf_k INT := 60;
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT kb.id, kb.content, kb.metadata,
           ROW_NUMBER() OVER (ORDER BY kb.embedding <=> query_embedding) AS rank_pos
    FROM knowledge_base kb
    ORDER BY kb.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT kb.id, kb.content, kb.metadata,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kb.fts, plainto_tsquery('english', query_text)) DESC) AS rank_pos
    FROM knowledge_base kb
    WHERE kb.fts @@ plainto_tsquery('english', query_text)
    ORDER BY ts_rank_cd(kb.fts, plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      COALESCE(s.id, k.id) AS id,
      COALESCE(s.content, k.content) AS content,
      COALESCE(s.metadata, k.metadata) AS metadata,
      (COALESCE(semantic_weight / (rrf_k + s.rank_pos), 0) +
       COALESCE(keyword_weight / (rrf_k + k.rank_pos), 0)) AS rrf_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT combined.id, combined.content, combined.metadata, combined.rrf_score AS score
  FROM combined
  ORDER BY combined.rrf_score DESC
  LIMIT match_count;
END;
$$;

-- 2. Semantic conversation memory
CREATE TABLE IF NOT EXISTS caller_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT[],
  sentiment TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caller_memories_email ON caller_memories (caller_email);
CREATE INDEX IF NOT EXISTS idx_caller_memories_embedding
  ON caller_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

CREATE OR REPLACE FUNCTION match_caller_memories(
  p_email TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  session_id TEXT,
  summary TEXT,
  topics TEXT[],
  sentiment TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.session_id,
    cm.summary,
    cm.topics,
    cm.sentiment,
    1 - (cm.embedding <=> query_embedding) AS similarity,
    cm.created_at
  FROM caller_memories cm
  WHERE cm.caller_email = p_email
  ORDER BY cm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 3. Share tokens for shareable call transcripts
CREATE TABLE IF NOT EXISTS share_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  views INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens (token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_session ON share_tokens (session_id);

-- 4. Follow-up tracking on call_summaries
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS follow_up_sent BOOLEAN DEFAULT false;
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS share_token TEXT;

-- 5. Add company column to call_summaries for analytics
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS company TEXT;
`;

console.log("\n=== V2 MIGRATION SQL ===\n");
console.log("Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard):\n");
console.log(SQL);
console.log("\n=== END SQL ===\n");
