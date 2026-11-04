import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { checkLimit } from "@/lib/rate-limit";
import { ticketFrom } from "@/lib/session-ticket";

export const runtime = "nodejs";

/** Minimum age of a call before it can be shared (a script can't mint-and-publish instantly). */
const MIN_CALL_AGE_S = 20;

/** Share links stop working after this long (the maintenance cron also deletes expired rows). */
const SHARE_TTL_DAYS = 30;

/** One answer for "not ready", whether the call is too new or not saved yet. */
const notReady = () => NextResponse.json({ error: "Your transcript is still saving. Try again in a moment.", retry: true }, { status: 409 });

/**
 * Opt-in share link for the caller's own saved call. It links the copy the
 * server saved for this session and takes no text from the browser. The route
 * never reads the transcript, so its answer can't depend on a name in it (the
 * old fact check here confirmed guessed confidential names). The share page
 * runs everything through the name-blind scrub before showing it.
 */
export async function POST(req: Request) {
  const ticket = ticketFrom(req);
  if (!ticket) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Math.floor(Date.now() / 1000) - ticket.iat < MIN_CALL_AGE_S) return notReady();
  if (!(await checkLimit("finish", `share:${ticket.sid}`)).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  // Only whether a saved call exists, never its content.
  const { data: call } = await supabase.from("call_summaries").select("session_id").eq("session_id", ticket.sid).maybeSingle();
  if (!call) return notReady();

  const existing = await supabase.from("share_tokens").select("token, expires_at").eq("session_id", ticket.sid).maybeSingle();
  const prior = existing.data as { token?: string; expires_at?: string | null } | null;
  if (prior?.token) {
    if (!prior.expires_at || new Date(prior.expires_at) > new Date()) {
      return NextResponse.json({ ok: true, share_token: prior.token, expires_at: prior.expires_at ?? null });
    }
    // Expired link: drop it and mint a fresh one below.
    await supabase.from("share_tokens").delete().eq("token", prior.token);
  }

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 86400_000).toISOString();
  const ins = await supabase.from("share_tokens").insert({ token, session_id: ticket.sid, expires_at: expiresAt });
  if (ins.error) return NextResponse.json({ error: "Couldn't create a link" }, { status: 500 });
  await supabase.from("call_summaries").update({ share_token: token }).eq("session_id", ticket.sid);
  return NextResponse.json({ ok: true, share_token: token, expires_at: expiresAt });
}
