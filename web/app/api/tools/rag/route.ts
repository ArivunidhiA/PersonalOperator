import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase || !OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "RAG not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const embedding = await getEmbedding(body.query);

  // First try the RPC function
  const rpcResult = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_threshold: 0.15,
    match_count: 5,
  });
  const rpcError = rpcResult.error;
  let data = rpcResult.data;

  // If RPC returns empty (can happen with ivfflat on small datasets), do a direct query
  if (!rpcError && (!data || data.length === 0)) {
    const { data: allRows, error: fetchErr } = await supabase
      .from("knowledge_base")
      .select("id, content, metadata, embedding");

    if (!fetchErr && allRows && allRows.length > 0) {
      // Compute cosine similarity manually
      // Supabase returns pgvector as a string like "[0.005,-0.03,...]"
      const scored = allRows
        .map((row: { id: string; content: string; metadata: unknown; embedding: string | number[] }) => {
          const rowEmb = typeof row.embedding === "string"
            ? JSON.parse(row.embedding) as number[]
            : row.embedding;
          const sim = cosineSimilarity(embedding, rowEmb);
          return { id: row.id, content: row.content, metadata: row.metadata, similarity: sim };
        })
        .filter((r: { similarity: number }) => r.similarity > 0.15)
        .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
        .slice(0, 5);

      data = scored;
    }
  }

  if (rpcError) {
    console.error("RAG search error:", rpcError);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }

  const results = (data || []).map(
    (r: { content: string; similarity: number; metadata: unknown }) => ({
      content: r.content,
      similarity: r.similarity,
      metadata: r.metadata,
    })
  );

  return NextResponse.json({ results });
}
