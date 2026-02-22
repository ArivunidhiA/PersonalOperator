// One-time script to create all Supabase tables
// Run: node scripts/setup-db.mjs

import { config } from "dotenv";
config({ path: ".env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const SQL = `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base for RAG
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- Call summaries for post-call processing
CREATE TABLE IF NOT EXISTS call_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  caller_name TEXT,
  caller_email TEXT,
  intent TEXT,
  summary TEXT,
  topics TEXT[],
  transcript JSONB,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_summaries_email ON call_summaries (caller_email);
CREATE INDEX IF NOT EXISTS idx_call_summaries_created ON call_summaries (created_at DESC);

-- Caller memory
CREATE TABLE IF NOT EXISTS callers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  company TEXT,
  role TEXT,
  interests TEXT[],
  call_count INTEGER DEFAULT 1,
  last_topics TEXT[],
  last_summary TEXT,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_callers_email ON callers (email);

-- Function for similarity search
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.metadata,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
`;

async function run() {
  // Use Supabase's pg endpoint (requires service role key)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: SQL }),
  });

  if (!res.ok) {
    // exec_sql doesn't exist, try the SQL endpoint directly
    console.log("exec_sql not available, trying direct SQL via pg...");

    // Split SQL into individual statements and execute via individual table creation
    // Since we can't run raw SQL, let's print the SQL for manual execution
    console.log("\n=== RUN THIS SQL IN SUPABASE SQL EDITOR ===\n");
    console.log(SQL);
    console.log("\n=== END SQL ===\n");
    process.exit(1);
  }

  console.log("Tables created successfully!");
}

run().catch(console.error);
