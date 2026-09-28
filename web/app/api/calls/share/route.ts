import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { checkLimit } from "@/lib/rate-limit";
import { ticketFrom } from "@/lib/session-ticket";
import { verifyTranscript } from "@/lib/verifier";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";

const log = createLogger({ tool: "call-share" });

/** Minimum age of a call before it can be shared (a script can't mint-and-publish instantly). */
const MIN_CALL_AGE_S = 20;

/**
 * Opt-in share link for the caller's own saved call. Transcripts are assembled
 * in the browser, so they're unverified: we refuse to publish one whose "agent"
 * lines fail the fact check, and the share page says it's caller-submitted.
 */
export async function POST(req: Request) {
  const ticket = ticketFrom(req);
  if (!ticket) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Math.floor(Date.now() / 1000) - ticket.iat < MIN_CALL_AGE_S) {
    return NextResponse.json({ error: "That call was too short to share." }, { status: 422 });
  }
  if (!(await checkLimit("finish", `share:${ticket.sid}`)).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  const { data: call } = await supabase.from("call_summaries").select("transcript").eq("session_id", ticket.sid).maybeSingle();
  if (!call) return NextResponse.json({ error: "Call not saved yet" }, { status: 404 });

  const msgs = (Array.isArray(call.transcript) ? call.transcript : []) as { role: string; text: string }[];
  const flags = verifyTranscript(
    msgs.filter((m) => m.role === "assistant").map((m) => m.text),
    msgs.filter((m) => m.role === "user").map((m) => m.text),
  ).filter((f) => f.rule !== "em dash" && f.rule !== "number not in facts");
  if (flags.length) {
    log.warn("share refused by fact check", { sessionId: ticket.sid, rules: flags.map((f) => f.rule) });
    return NextResponse.json({ error: "This transcript can't be shared." }, { status: 422 });
  }

  const existing = await supabase.from("share_tokens").select("token").eq("session_id", ticket.sid).maybeSingle();
  if (existing.data?.token) return NextResponse.json({ ok: true, share_token: existing.data.token });

  const token = randomBytes(16).toString("hex");
  const ins = await supabase.from("share_tokens").insert({ token, session_id: ticket.sid });
  if (ins.error) return NextResponse.json({ error: "Couldn't create a link" }, { status: 500 });
  await supabase.from("call_summaries").update({ share_token: token }).eq("session_id", ticket.sid);
  return NextResponse.json({ ok: true, share_token: token });
}
