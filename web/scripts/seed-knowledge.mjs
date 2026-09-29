// Mirror lib/knowledge.ts (the single source of truth) into Supabase knowledge_base.
//
//   node scripts/seed-knowledge.mjs            # safe swap: embed -> insert new -> verify -> delete old
//   node scripts/seed-knowledge.mjs --dry-run  # show what would be written
//   node scripts/seed-knowledge.mjs --verify   # read-only: does the DB match the code?
//
// Needs Node 23+ (imports the .ts registry directly), NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in web/.env.local (vercel env pull .env.local).
// Embeddings: Gemini gemini-embedding-001 (free tier) at 1536 dims if GEMINI_API_KEY is
// set, else OpenAI text-embedding-3-small, else rows are stored without embeddings.
// The app itself answers from lib/knowledge.ts in memory; this table is a mirror.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { FACTS } from "../lib/knowledge.ts";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(webDir, ".env.local"), quiet: true });
config({ path: join(webDir, ".env"), quiet: true });

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const VERIFY = args.has("--verify");

const { NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, GEMINI_API_KEY, OPENAI_API_KEY } = process.env;
if (!URL_ || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (vercel env pull .env.local)");
  process.exit(1);
}
const sb = createClient(URL_, KEY);
const rowText = (f) => `${f.topic}: ${f.text}`;

async function embed(text) {
  if (GEMINI_API_KEY) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({ content: { parts: [{ text }] }, taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 1536 }),
    });
    const data = await res.json();
    if (!res.ok || !data?.embedding?.values) throw new Error(`Gemini embedding failed: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    return { model: "gemini-embedding-001@1536", values: data.embedding.values };
  }
  if (OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    const data = await res.json();
    if (!res.ok || !data?.data?.[0]?.embedding) throw new Error(`OpenAI embedding failed: ${res.status}`);
    return { model: "text-embedding-3-small", values: data.data[0].embedding };
  }
  return { model: null, values: null };
}

async function verify() {
  const { data, error } = await sb.from("knowledge_base").select("content, metadata");
  if (error) throw new Error(error.message);
  const want = new Map(FACTS.map((f) => [f.id, rowText(f)]));
  const problems = [];
  for (const row of data) {
    const id = row.metadata?.fact_id;
    if (!id || !want.has(id)) problems.push(`extra/stale row: ${row.content.slice(0, 80)}`);
    else if (want.get(id) !== row.content) problems.push(`out of date: ${id}`);
  }
  for (const id of want.keys()) if (!data.some((r) => r.metadata?.fact_id === id)) problems.push(`missing: ${id}`);
  console.log(`knowledge_base rows: ${data.length}, facts in code: ${FACTS.length}`);
  if (problems.length) {
    console.log(`NOT IN SYNC (${problems.length}):\n- ${problems.join("\n- ")}`);
    return false;
  }
  console.log("In sync with lib/knowledge.ts.");
  return true;
}

async function main() {
  if (VERIFY) process.exit((await verify()) ? 0 : 2);

  const runId = `seed-${new Date().toISOString()}`;
  console.log(`Embedding ${FACTS.length} facts (nothing in the DB changes until all succeed)...`);
  const rows = [];
  for (const f of FACTS) {
    const e = await embed(rowText(f));
    rows.push({
      content: rowText(f),
      metadata: { fact_id: f.id, topic: f.topic, run: runId, embedding_model: e.model },
      embedding: e.values,
    });
  }
  if (DRY) {
    console.log(rows.map((r) => `- ${r.metadata.fact_id} (${r.content.length} chars, embedding: ${r.metadata.embedding_model})`).join("\n"));
    return;
  }

  const ins = await sb.from("knowledge_base").insert(rows);
  if (ins.error) throw new Error(`insert failed, DB unchanged: ${ins.error.message}`);
  const { data: fresh, error: freshErr } = await sb.from("knowledge_base").select("id").eq("metadata->>run", runId);
  if (freshErr || fresh.length !== rows.length) {
    await sb.from("knowledge_base").delete().eq("metadata->>run", runId);
    throw new Error(`verification failed (${fresh?.length}/${rows.length}); rolled back the new rows, old rows untouched`);
  }
  const del = await sb.from("knowledge_base").delete().or(`metadata->>run.is.null,metadata->>run.neq.${runId}`);
  if (del.error) throw new Error(`new rows are in, but deleting old rows failed: ${del.error.message}`);
  console.log(`Inserted ${rows.length} rows and removed the old ones.`);
  await verify();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
