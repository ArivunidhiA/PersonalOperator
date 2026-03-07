import { createLogger } from "./logger";
import { getSupabase } from "./supabase";

const log = createLogger({ tool: "hybrid-rag" });
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

export interface RagResult {
  content: string;
  metadata: unknown;
  score: number;
}

/**
 * Hybrid search: combines semantic (pgvector) + keyword (tsvector) search
 * using Reciprocal Rank Fusion. Falls back to semantic-only if hybrid RPC
 * is unavailable (pre-migration).
 */
export async function hybridSearch(
  query: string,
  count: number = 5,
  sessionId?: string,
): Promise<RagResult[]> {
  const supabase = getSupabase();
  if (!supabase || !OPENAI_API_KEY) return [];

  const slog = log.child({ sessionId });
  const embedding = await slog.time("embedding", () => getEmbedding(query));

  // Try hybrid search first
  const hybridResult = await slog.time("hybrid-rpc", async () =>
    supabase.rpc("match_knowledge_hybrid", {
      query_text: query,
      query_embedding: embedding,
      semantic_weight: 0.6,
      keyword_weight: 0.4,
      match_count: count,
    }),
  );
  const hybridData = hybridResult.data;
  const hybridError = hybridResult.error;

  if (!hybridError && hybridData && hybridData.length > 0) {
    slog.info("Hybrid search returned results", { resultCount: hybridData.length });
    return hybridData.map(
      (r: { content: string; metadata: unknown; score: number }) => ({
        content: r.content,
        metadata: r.metadata,
        score: r.score,
      }),
    );
  }

  if (hybridError) {
    slog.warn("Hybrid RPC unavailable, falling back to semantic-only", {
      error: hybridError.message,
    });
  }

  // Fallback: semantic-only via existing RPC
  const semResult = await slog.time("semantic-rpc", async () =>
    supabase.rpc("match_knowledge", {
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: count,
    }),
  );
  const semData = semResult.data;
  const semError = semResult.error;

  if (semError) {
    slog.error("Semantic search failed", { error: semError.message });
    return [];
  }

  if (!semData || semData.length === 0) {
    // Last resort: manual cosine similarity
    const { data: allRows } = await supabase
      .from("knowledge_base")
      .select("id, content, metadata, embedding");

    if (!allRows || allRows.length === 0) return [];

    return allRows
      .map(
        (row: {
          content: string;
          metadata: unknown;
          embedding: string | number[];
        }) => {
          const rowEmb =
            typeof row.embedding === "string"
              ? (JSON.parse(row.embedding) as number[])
              : row.embedding;
          let dot = 0,
            magA = 0,
            magB = 0;
          for (let i = 0; i < embedding.length; i++) {
            dot += embedding[i] * rowEmb[i];
            magA += embedding[i] ** 2;
            magB += rowEmb[i] ** 2;
          }
          const denom = Math.sqrt(magA) * Math.sqrt(magB);
          const sim = denom === 0 ? 0 : dot / denom;
          return { content: row.content, metadata: row.metadata, score: sim };
        },
      )
      .filter((r) => r.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  return (semData || []).map(
    (r: { content: string; metadata: unknown; similarity: number }) => ({
      content: r.content,
      metadata: r.metadata,
      score: r.similarity,
    }),
  );
}

/**
 * Re-rank results using GPT-4o-mini as a cross-encoder.
 * Only called when we have enough results to justify the cost.
 */
export async function rerank(
  query: string,
  results: RagResult[],
  topK: number = 3,
): Promise<RagResult[]> {
  if (results.length <= topK || !OPENAI_API_KEY) return results.slice(0, topK);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Given a query and numbered passages, return a JSON array of the ${topK} most relevant passage numbers in order of relevance. Return ONLY a JSON array like [2,0,4].`,
          },
          {
            role: "user",
            content: `Query: "${query}"\n\nPassages:\n${results.map((r, i) => `[${i}] ${r.content.slice(0, 300)}`).join("\n\n")}`,
          },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) return results.slice(0, topK);

    const data = await res.json();
    const indices: number[] = JSON.parse(data.choices[0].message.content);
    return indices
      .filter((i) => i >= 0 && i < results.length)
      .map((i) => results[i])
      .slice(0, topK);
  } catch {
    log.warn("Reranking failed, returning original order");
    return results.slice(0, topK);
  }
}
