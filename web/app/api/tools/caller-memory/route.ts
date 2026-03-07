import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { recallMemories } from "@/lib/semantic-memory";
import { createLogger } from "@/lib/logger";

const log = createLogger({ tool: "caller-memory" });

export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const { email } = body;
  const contextQuery = body.context || "previous conversations and interests";

  try {
    // Fetch structured caller record
    const { data: caller } = await supabase
      .from("callers")
      .select("*")
      .eq("email", email)
      .single();

    if (!caller) {
      log.info("First-time caller", { callerId: email });
      return NextResponse.json({ found: false });
    }

    // Fetch semantically relevant memories
    const memories = await recallMemories(email, contextQuery, 3);

    // Fetch recent call summaries
    const { data: recentCalls } = await supabase
      .from("call_summaries")
      .select("session_id, summary, topics, outcome, created_at")
      .eq("caller_email", email)
      .order("created_at", { ascending: false })
      .limit(3);

    log.info("Caller found", {
      callerId: email,
      callCount: caller.call_count,
      memoryCount: memories.length,
    });

    return NextResponse.json({
      found: true,
      caller,
      memories: memories.map((m) => ({
        summary: m.summary,
        topics: m.topics,
        sentiment: m.sentiment,
        when: m.createdAt,
      })),
      recent_calls: recentCalls || [],
    });
  } catch (err) {
    log.error("Caller memory lookup failed", {
      callerId: email,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Lookup failed" },
      { status: 500 },
    );
  }
}
