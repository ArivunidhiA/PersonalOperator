import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import { checkLimit, safeRedis } from "@/lib/rate-limit";
import { verifyTicket } from "@/lib/session-ticket";
import { completeJSON } from "@/lib/llm";
import { verifyTranscript } from "@/lib/verifier";
import { escapeHtml } from "@/lib/html";
import { LINKS } from "@/lib/knowledge";
import { createLogger } from "@/lib/logger";
import { fallbackAnalysis, type Analysis, type Msg } from "@/lib/call-summary";

export const runtime = "nodejs";
export const maxDuration = 30;

const log = createLogger({ tool: "call-finish" });

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 plain sentences on what the caller wanted and what they were told." },
    intent: { type: "string", enum: ["recruiter", "hiring_manager", "engineer", "general_inquiry", "scheduling", "unknown"] },
    topics: { type: "array", items: { type: "string" }, description: "Up to 5 short topics." },
    outcome: { type: "string", enum: ["booking_link_shared", "info_provided", "dropped_off"] },
    company: { type: ["string", "null"], description: "Caller's company ONLY if the caller clearly said it; otherwise null." },
    role: { type: ["string", "null"], description: "Role discussed ONLY if the caller clearly said it; otherwise null." },
  },
  required: ["summary", "intent", "topics", "outcome", "company", "role"],
};

/**
 * Called once when a call ends (button, tab close via sendBeacon, or timeout).
 * Saves the transcript, writes a summary, makes a share link, and notifies Ariv.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: { ticket?: unknown; messages?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const ticket = verifyTicket(req.headers.get("x-session-ticket") ?? (typeof body.ticket === "string" ? body.ticket : null));
  if (!ticket) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sid = ticket.sid;
  const slog = log.child({ sessionId: sid });

  const messages: Msg[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is Msg => !!m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
    .map((m) => ({ role: m.role, text: m.text.slice(0, 4000).trim() }))
    .filter((m) => m.text)
    .slice(0, 300);

  // Nothing the caller said = nothing worth summarizing (no junk summaries).
  if (!messages.some((m) => m.role === "user")) return NextResponse.json({ ok: true, skipped: true });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Storage not configured" }, { status: 503 });

  if (!(await checkLimit("finish", sid)).ok) return NextResponse.json({ error: "Already saved" }, { status: 429 });

  // Idempotent: the button and the tab-close beacon can both fire.
  const lock = await safeRedis((r) => r.set(`finish:${sid}`, 1, { nx: true, ex: 120 }), "OK" as const);
  if (!lock) {
    const existing = await supabase.from("call_summaries").select("share_token, summary").eq("session_id", sid).maybeSingle();
    return NextResponse.json({ ok: true, share_token: existing.data?.share_token ?? null, summary: existing.data?.summary ?? null });
  }
  const already = await supabase.from("call_summaries").select("share_token, summary").eq("session_id", sid).maybeSingle();
  if (already.data) return NextResponse.json({ ok: true, share_token: already.data.share_token, summary: already.data.summary });

  const transcript = messages.map((m) => `${m.role === "user" ? "Caller" : "Ariv's AI"}: ${m.text}`).join("\n");
  const analysis = (await completeJSON<Analysis>({
    system:
      "You summarize calls between a visitor and Ariv's AI voice agent. Be literal: only report what was actually said. Never invent a company, role or name; use null when the caller didn't clearly state it. Speech-to-text can garble words, so don't treat one odd word as a company.",
    user: transcript.slice(0, 30_000),
    schema: ANALYSIS_SCHEMA,
    maxTokens: 500,
    timeoutMs: 20_000,
  })) ?? fallbackAnalysis(messages);

  const flags = verifyTranscript(
    messages.filter((m) => m.role === "assistant").map((m) => m.text),
    messages.filter((m) => m.role === "user").map((m) => m.text),
  );
  // Transcripts are assembled in the caller's browser, so they can be forged.
  // Never publish a share link for one whose "agent" lines fail the fact check.
  const severe = flags.some((f) => f.rule !== "number not in facts" && f.rule !== "em dash");
  const shareToken = severe ? null : randomBytes(16).toString("hex");

  await supabase.from("conversations").upsert(
    { session_id: sid, user_id: ticket.uid ?? "anonymous", messages, updated_at: new Date().toISOString() },
    { onConflict: "session_id" },
  );
  const inserted = await supabase.from("call_summaries").insert({
    session_id: sid,
    caller_name: null,
    caller_email: ticket.em,
    intent: analysis.intent,
    summary: analysis.summary,
    topics: (analysis.topics || []).slice(0, 5),
    transcript: messages,
    outcome: analysis.outcome,
    company: analysis.company,
    share_token: shareToken,
    follow_up_sent: false,
  });
  if (inserted.error) {
    slog.error("save summary failed", { error: inserted.error.message });
    return NextResponse.json({ ok: false, error: "Couldn't save the call" }, { status: 500 });
  }
  if (shareToken) await supabase.from("share_tokens").insert({ token: shareToken, session_id: sid });

  if (ticket.em) {
    const { data: caller } = await supabase.from("callers").select("id, call_count").eq("email", ticket.em).maybeSingle();
    const fields = { company: analysis.company ?? undefined, role: analysis.role ?? undefined, last_topics: analysis.topics, last_summary: analysis.summary, last_seen: new Date().toISOString() };
    if (caller) await supabase.from("callers").update({ ...fields, call_count: (caller.call_count || 1) + 1 }).eq("id", caller.id);
    else await supabase.from("callers").insert({ email: ticket.em, ...fields, interests: analysis.topics });
  }

  await notifyAriv({ sid, analysis, transcript, shareToken, flags, signedIn: !!ticket.uid }).catch((err) =>
    slog.warn("notify failed", { error: err instanceof Error ? err.message : String(err) }),
  );
  if (flags.length) slog.warn("verifier flags", { count: flags.length, rules: [...new Set(flags.map((f) => f.rule))] });
  slog.info("call saved", { intent: analysis.intent, outcome: analysis.outcome, turns: messages.length });

  return NextResponse.json({ ok: true, share_token: shareToken, summary: analysis.summary });
}

async function notifyAriv(p: {
  sid: string;
  analysis: Analysis;
  transcript: string;
  shareToken: string | null;
  flags: { rule: string; excerpt: string }[];
  signedIn: boolean;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://arivsai.app";
  const a = p.analysis;
  const flagsHtml = p.flags.length
    ? `<p style="color:#b45309"><strong>Check these lines (automatic fact check):</strong></p><ul>${p.flags
        .slice(0, 10)
        .map((f) => `<li>${escapeHtml(f.rule)}: "${escapeHtml(f.excerpt)}"</li>`)
        .join("")}</ul>`
    : "";
  const { error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM || "Ariv's AI <ai@arivsai.app>",
    to: process.env.ARIV_NOTIFY_EMAIL || LINKS.email,
    subject: `New call: ${a.intent}${a.company ? ` (${a.company.slice(0, 60)})` : ""}`,
    html: `<div style="font-family:sans-serif;line-height:1.6;max-width:640px">
<p><strong>Summary:</strong> ${escapeHtml(a.summary)}</p>
<p><strong>Intent:</strong> ${escapeHtml(a.intent)} &middot; <strong>Outcome:</strong> ${escapeHtml(a.outcome)} &middot; <strong>Signed in:</strong> ${p.signedIn ? "yes" : "no"}</p>
${a.company ? `<p><strong>Company (as stated):</strong> ${escapeHtml(a.company)}</p>` : ""}
${a.role ? `<p><strong>Role:</strong> ${escapeHtml(a.role)}</p>` : ""}
<p><strong>Topics:</strong> ${escapeHtml((a.topics || []).join(", ") || "n/a")}</p>
${flagsHtml}
${p.shareToken ? `<p><a href="${escapeHtml(`${appUrl}/call/${p.shareToken}`)}">Open transcript</a></p>` : "<p>No share link was made (fact check flagged the transcript).</p>"}
<pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:13px">${escapeHtml(p.transcript.slice(0, 20_000))}</pre>
</div>`,
  });
  // Resend reports failures in the result instead of throwing.
  if (error) throw new Error(`resend: ${error.name ?? ""} ${error.message ?? ""}`.trim());
}
