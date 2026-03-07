import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createLogger } from "@/lib/logger";

const log = createLogger({ tool: "share-call" });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    // Verify token exists and hasn't expired
    const { data: tokenRecord, error: tokenError } = await supabase
      .from("share_tokens")
      .select("session_id, expires_at, views")
      .eq("token", token)
      .single();

    if (tokenError || !tokenRecord) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }

    // Increment view count
    await supabase
      .from("share_tokens")
      .update({ views: (tokenRecord.views || 0) + 1 })
      .eq("token", token);

    // Fetch the call summary
    const { data: call } = await supabase
      .from("call_summaries")
      .select("session_id, caller_name, intent, summary, topics, transcript, outcome, company, created_at")
      .eq("session_id", tokenRecord.session_id)
      .single();

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    log.info("Shared call viewed", {
      sessionId: tokenRecord.session_id,
      views: (tokenRecord.views || 0) + 1,
    });

    return NextResponse.json({
      caller: call.caller_name || "Anonymous",
      company: call.company || null,
      intent: call.intent,
      summary: call.summary,
      topics: call.topics || [],
      outcome: call.outcome,
      date: call.created_at,
      transcript: (call.transcript || []).map(
        (m: { role: string; text: string }) => ({
          role: m.role === "user" ? "Caller" : "Ariv's AI",
          text: m.text,
        }),
      ),
    });
  } catch (err) {
    log.error("Share call fetch error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
