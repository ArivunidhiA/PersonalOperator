import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createLogger } from "@/lib/logger";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import { scrubNames, type Msg } from "@/lib/call-summary";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" };

const log = createLogger({ tool: "share-call" });

/** Speaker labels on the public page. Never the caller's name. */
const SPEAKERS = { user: "You", assistant: "Ariv's AI" } as const;

/**
 * Public view of a shared call. Every line, both speakers, plus summary and
 * topics goes through the same name-blind scrub as the post-call summary, so a
 * company the caller said doesn't show here. No caller name, no company field,
 * and no list of confidential names on this path: every name is treated alike.
 */
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
      .select("session_id, intent,summary, topics, transcript, outcome, company, created_at")
      .eq("session_id", tokenRecord.session_id)
      .single();

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    log.info("Shared call viewed", { sessionId: tokenRecord.session_id });

    const messages: Msg[] = (Array.isArray(call.transcript) ? call.transcript : []).flatMap((m: { role?: unknown; text?: unknown }) =>
      (m.role === "user" || m.role === "assistant") && typeof m.text === "string" ? [{ role: m.role, text: m.text } as Msg] : [],
    );
    // The company field only widens the scrub; it's never shown.
    const clean = (t: string) => scrubNames(t, messages, [typeof call.company === "string" ? call.company : null]);

    return NextResponse.json({
      verified: false,
      intent: call.intent,
      summary: clean(String(call.summary ?? "")),
      topics: (Array.isArray(call.topics) ? call.topics : []).map(String).map(clean),
      outcome: call.outcome,
      date: call.created_at,
      transcript: messages.map((m) => ({ role: SPEAKERS[m.role], text: clean(m.text) })),
    }, { headers: NOINDEX });
  } catch (err) {
    log.error("Share call fetch error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
