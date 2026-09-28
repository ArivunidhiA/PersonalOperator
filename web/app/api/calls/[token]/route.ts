import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createLogger } from "@/lib/logger";
import { checkLimit, clientIp } from "@/lib/rate-limit";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" };

const log = createLogger({ tool: "share-call" });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400, headers: NOINDEX });
  }
  if (!(await checkLimit("shareView", clientIp(req))).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: NOINDEX });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    // Verify token exists and hasn't expired
    const { data: tokenRecord, error: tokenError } = await supabase
      .from("share_tokens")
      .select("session_id, expires_at")
      .eq("token", token)
      .single();

    if (tokenError || !tokenRecord) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }

    // Fetch the call summary
    const { data: call } = await supabase
      .from("call_summaries")
      .select("session_id, caller_name, intent, summary, topics, transcript, outcome, company, created_at")
      .eq("session_id", tokenRecord.session_id)
      .single();

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    log.info("Shared call viewed", { sessionId: tokenRecord.session_id });

    return NextResponse.json({
      verified: false,
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
    }, { headers: NOINDEX });
  } catch (err) {
    log.error("Share call fetch error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
