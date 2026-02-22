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

  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: 5,
  });

  if (error) {
    console.error("RAG search error:", error);
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
