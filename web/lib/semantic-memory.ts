import { createLogger } from "./logger";
import { getSupabase } from "./supabase";

const log = createLogger({ tool: "semantic-memory" });
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

export interface CallerMemoryEntry {
  sessionId: string;
  summary: string;
  topics: string[];
  sentiment: string;
  similarity: number;
  createdAt: string;
}

/**
 * Retrieve semantically relevant memories for a caller.
 * Uses vector similarity over past conversation summaries.
 */
export async function recallMemories(
  email: string,
  contextQuery: string,
  count: number = 5,
): Promise<CallerMemoryEntry[]> {
  const supabase = getSupabase();
  if (!supabase || !OPENAI_API_KEY || !email) return [];

  try {
    const embedding = await getEmbedding(contextQuery);

    const { data, error } = await supabase.rpc("match_caller_memories", {
      p_email: email,
      query_embedding: embedding,
      match_count: count,
    });

    if (error) {
      log.warn("Semantic memory recall failed, falling back to recent", {
        error: error.message,
      });
      return fallbackRecent(email, count);
    }

    if (!data || data.length === 0) {
      return fallbackRecent(email, count);
    }

    return data.map(
      (m: {
        session_id: string;
        summary: string;
        topics: string[];
        sentiment: string;
        similarity: number;
        created_at: string;
      }) => ({
        sessionId: m.session_id,
        summary: m.summary,
        topics: m.topics || [],
        sentiment: m.sentiment || "neutral",
        similarity: m.similarity,
        createdAt: m.created_at,
      }),
    );
  } catch (err) {
    log.error("Semantic memory recall error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackRecent(email, count);
  }
}

async function fallbackRecent(
  email: string,
  count: number,
): Promise<CallerMemoryEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from("call_summaries")
    .select("session_id, summary, topics, outcome, created_at")
    .eq("caller_email", email)
    .order("created_at", { ascending: false })
    .limit(count);

  if (!data) return [];

  return data.map(
    (r: {
      session_id: string;
      summary: string;
      topics: string[];
      outcome: string;
      created_at: string;
    }) => ({
      sessionId: r.session_id,
      summary: r.summary || "",
      topics: r.topics || [],
      sentiment: r.outcome || "unknown",
      similarity: 1,
      createdAt: r.created_at,
    }),
  );
}

/**
 * Store a conversation memory with its embedding for future semantic recall.
 */
export async function storeMemory(params: {
  callerEmail: string;
  sessionId: string;
  summary: string;
  topics: string[];
  sentiment: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !OPENAI_API_KEY || !params.callerEmail) return;

  try {
    const textForEmbedding = `${params.summary}. Topics: ${params.topics.join(", ")}. Sentiment: ${params.sentiment}`;
    const embedding = await getEmbedding(textForEmbedding);

    const { error } = await supabase.from("caller_memories").insert({
      caller_email: params.callerEmail,
      session_id: params.sessionId,
      summary: params.summary,
      topics: params.topics,
      sentiment: params.sentiment,
      embedding,
    });

    if (error) {
      log.error("Failed to store caller memory", { error: error.message });
    } else {
      log.info("Stored caller memory", {
        sessionId: params.sessionId,
        callerId: params.callerEmail,
      });
    }
  } catch (err) {
    log.error("storeMemory error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
