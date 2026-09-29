import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import { checkLimit, safeRedis } from "@/lib/rate-limit";
import { verifyTicket } from "@/lib/session-ticket";
import { completeJSON } from "@/lib/llm";
import { verifyTranscript } from "@/lib/verifier";
import { escapeHtml } from "@/lib/html";
import { LINKS } from "@/lib/knowledge";
import { createLogger } from "@/lib/logger";
import { MAX_CALL_SECONDS } from "@/lib/voice-config";
import { fallbackAnalysis, type Analysis, type Msg } from "@/lib/call-summary";
import { visitorHistory, type VisitorHistory } from "@/lib/analytics-store";
import { lookupNetwork, rawIp, requestContext, type RequestContext } from "@/lib/visitor";

export const runtime = "nodejs";
export const maxDuration = 30;

const log = createLogger({ tool: "call-finish" });

const MAX_BODY = 48_000;
const MAX_MESSAGES = 120;

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 plain sentences on what the caller wanted and what they were told." },
    intent: { type: "string", enum: ["recruiter", "hiring_manager", "engineer", "general_inquiry", "scheduling", "unknown"] },
    topics: { type: "array", items: { type: "string" }, description: "Up to 5 short topics." },
    outcome: { type: "string", enum: ["booking_link_shared", "info_provided", "dropped_off"] },
    caller_name: { type: ["string", "null"], description: "The caller's own name ONLY if they clearly said it (e.g. 'I'm Sam'); otherwise null." },
    caller_role: { type: ["string", "null"], description: "What the caller does ONLY if they clearly said it (e.g. 'recruiter', 'engineering manager'); otherwise null." },
    company: { type: ["string", "null"], description: "The caller's company ONLY if the caller clearly said it; otherwise null." },
    role: { type: ["string", "null"], description: "The role they're hiring for or asking about, ONLY if clearly said; otherwise null." },
  },
  required: ["summary", "intent", "topics", "outcome", "caller_name", "caller_role", "company", "role"],
};

const cap = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/**
 * Saves a call. Called when a call ends (button, timeout, drop), and also as a
 * snapshot when a phone backgrounds the tab (the socket may be killed), so it's
 * save-or-update: a later call with a longer transcript updates the record.
 * Ariv is notified once per call. Sharing is a separate, opt-in step.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });
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
    .map((m) => ({ role: m.role, text: m.text.slice(0, 2000).trim() }))
    .filter((m) => m.text)
    .slice(0, MAX_MESSAGES);

  // Nothing the caller said = nothing worth summarizing (no junk summaries).
  if (!messages.some((m) => m.role === "user")) return NextResponse.json({ ok: true, skipped: true });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Storage not configured" }, { status: 503 });
  if (!(await checkLimit("finish", sid)).ok) return NextResponse.json({ ok: false, error: "Too many saves" }, { status: 429 });

  // Short lock so a snapshot and the final save don't process at the same time.
  const lockKey = `finish-lock:${sid}`;
  const locked = await safeRedis<string | number | null>((r) => r.set(lockKey, 1, { nx: true, ex: 25 }), "OK");
  if (!locked) return NextResponse.json({ ok: false, pending: true, error: "Saving, try again in a moment" }, { status: 409 });
  const unlock = () => safeRedis((r) => r.del(lockKey), 0);

  try {
    const existing = await supabase.from("call_summaries").select("summary, transcript").eq("session_id", sid).maybeSingle();
    const prevLen = Array.isArray(existing.data?.transcript) ? existing.data.transcript.length : 0;
    if (existing.data && messages.length <= prevLen) {
      return NextResponse.json({ ok: true, summary: existing.data.summary ?? null });
    }

    const transcript = messages.map((m) => `${m.role === "user" ? "Caller" : "Ariv's AI"}: ${m.text}`).join("\n");
    const analysis =
      (await completeJSON<Analysis>({
        system:
          "You summarize calls between a visitor and Ariv's AI voice agent. Be literal: only report what was actually said. Never invent a name, company or role; use null when the caller didn't clearly state it about themselves. Speech-to-text can garble words, so don't treat one odd word as a name or company.",
        user: transcript.slice(0, 30_000),
        schema: ANALYSIS_SCHEMA,
        maxTokens: 500,
        timeoutMs: 20_000,
      })) ?? fallbackAnalysis(messages);
    const topics = Array.isArray(analysis.topics) ? analysis.topics.map(String).slice(0, 5) : [];
    const flags = verifyTranscript(
      messages.filter((m) => m.role === "assistant").map((m) => m.text),
      messages.filter((m) => m.role === "user").map((m) => m.text),
    );
    const row = {
      intent: String(analysis.intent ?? "unknown"),
      summary: String(analysis.summary ?? "").slice(0, 600),
      topics,
      transcript: messages,
      outcome: String(analysis.outcome ?? "info_provided"),
      company: cap(analysis.company, 80),
      caller_name: cap(analysis.caller_name, 80),
    };

    // Analytics for Ariv's dashboard: who (as they said it), from where, how long, what they asked.
    const ctx = requestContext(req);
    const history = await visitorHistory(ticket.vid, sid).catch(() => null);
    const network = history?.network ?? (ctx.bot || !ticket.vid ? null : await lookupNetwork(rawIp(req)));
    const extra = {
      visitor_id: ticket.vid ?? null,
      caller_role: cap(analysis.caller_role, 80),
      hiring_for: cap(analysis.role, 80),
      questions: messages.filter((m) => m.role === "user").map((m) => m.text.slice(0, 240)).slice(0, 20),
      duration_s: Math.max(0, Math.min(MAX_CALL_SECONDS + 120, Math.round(Date.now() / 1000) - ticket.iat)),
      context: {
        country: ctx.country,
        region: ticket.vid ? ctx.region : null,
        city: ticket.vid ? ctx.city : null,
        device: ctx.device,
        browser: ctx.browser,
        os: ctx.os,
        network: network ? { org: network.org, domain: network.domain, host: network.host, kind: network.kind } : null,
        referrer: history?.referrer ?? null,
        utm: history?.utm ?? null,
        visits: history?.visits ?? null,
        firstSeen: history?.firstSeen ?? null,
        clicks: history?.clicks ?? [],
        signedIn: !!ticket.uid,
      },
      is_owner: !!ticket.own,
      is_bot: ctx.bot,
    };
    const saveExtra = async () => {
      const r = await supabase.from("call_summaries").update(extra).eq("session_id", sid);
      if (r.error) slog.warn("analytics columns not saved (run scripts/migrate-v4.sql?)", { error: r.error.message.slice(0, 200) });
    };

    if (existing.data) {
      const upd = await supabase.from("call_summaries").update(row).eq("session_id", sid);
      if (upd.error) throw new Error(upd.error.message);
      await saveExtra();
      slog.info("call updated", { turns: messages.length });
      return NextResponse.json({ ok: true, summary: row.summary });
    }

    const ins = await supabase.from("call_summaries").insert({ session_id: sid, caller_email: ticket.em, follow_up_sent: false, ...row });
    if (ins.error) {
      // A concurrent save may have won (unique index on session_id): treat as saved.
      const again = await supabase.from("call_summaries").select("summary").eq("session_id", sid).maybeSingle();
      if (again.data) return NextResponse.json({ ok: true, summary: again.data.summary ?? null });
      throw new Error(ins.error.message);
    }
    await saveExtra();

    if (ticket.em) {
      const { data: caller } = await supabase.from("callers").select("id, call_count").eq("email", ticket.em).maybeSingle();
      const fields = { company: row.company ?? undefined, last_topics: topics, last_summary: row.summary, last_seen: new Date().toISOString() };
      const res = caller
        ? await supabase.from("callers").update({ ...fields, call_count: (caller.call_count || 1) + 1 }).eq("id", caller.id)
        : await supabase.from("callers").insert({ email: ticket.em, ...fields, interests: topics });
      if (res.error) slog.warn("caller upsert failed", { error: res.error.message });
    }

    // Ariv's own test calls don't need an email; automated test calls are labeled.
    if (ticket.own && process.env.NOTIFY_OWNER_CALLS !== "1") {
      slog.info("owner call; no notification");
    } else if ((await checkLimit("notifyDaily", "all")).ok) {
      await notifyAriv({ sid, analysis: { ...analysis, summary: row.summary, topics }, transcript, flags, signedIn: !!ticket.uid, extra, ctx, history })
        .then(async (id) => {
          slog.info("notified", { emailId: id });
          // Keep Resend's id on the call: Vercel only surfaces a request's first log line (F-05).
          if (!id) return;
          const r = await supabase
            .from("call_summaries")
            .update({ context: { ...extra.context, notified: { emailId: id, at: new Date().toISOString() } } })
            .eq("session_id", sid);
          if (r.error) slog.warn("couldn't record the notification", { error: r.error.message.slice(0, 200) });
        })
        .catch((err) => slog.warn("notify failed", { error: err instanceof Error ? err.message : String(err) }));
    } else {
      slog.warn("notification cap reached; call saved without email");
    }
    if (flags.length) slog.warn("verifier flags", { count: flags.length, rules: [...new Set(flags.map((f) => f.rule))] });
    slog.info("call saved", { intent: row.intent, outcome: row.outcome, turns: messages.length });
    return NextResponse.json({ ok: true, summary: row.summary });
  } catch (err) {
    slog.error("save failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: "Couldn't save the call" }, { status: 500 });
  } finally {
    await unlock();
  }
}

/** ARIV_NOTIFY_EMAIL may list several addresses, comma-separated (server config only, never caller input). */
export function notifyRecipients(): string[] {
  const list = (process.env.ARIV_NOTIFY_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  return list.length ? list.slice(0, 5) : [LINKS.email];
}

const fmtDuration = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

async function notifyAriv(p: {
  sid: string;
  analysis: Analysis;
  transcript: string;
  flags: { rule: string; excerpt: string }[];
  signedIn: boolean;
  extra: { caller_role: string | null; hiring_for: string | null; questions: string[]; duration_s: number; context: { network: { org: string | null; domain: string | null; host: string | null; kind: string | null } | null } };
  ctx: RequestContext;
  history: VisitorHistory | null;
}): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const a = p.analysis;
  const who = [cap(a.caller_name, 60), cap(p.extra.caller_role, 60), cap(a.company, 60)].filter(Boolean).join(", ");
  const where = [p.ctx.city, p.ctx.region, p.ctx.country].filter(Boolean).join(", ");
  const net = p.extra.context.network;
  const netText = net?.org ? `${net.org}${net.domain ? ` (${net.domain})` : ""}${net.kind === "isp" ? " · home/mobile ISP" : net.kind === "hosting" ? " · cloud/VPN" : " · possibly their company"}` : "";
  const source = p.history?.referrer || (p.history?.utm ? Object.entries(p.history.utm).map(([k, v]) => `${k}=${v}`).join(" ") : "") || "direct / unknown";
  const test = p.ctx.bot ? "[test] " : "";
  const subject = `${test}New call: ${who || a.intent}${where ? ` · ${where}` : ""}`.slice(0, 140);
  const line = (label: string, value: string | null | undefined) => (value ? `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>` : "");
  const flagsHtml = p.flags.length
    ? `<p style="color:#b45309"><strong>Check these lines (automatic fact check):</strong></p><ul>${p.flags
        .slice(0, 10)
        .map((f) => `<li>${escapeHtml(f.rule)}: "${escapeHtml(f.excerpt)}"</li>`)
        .join("")}</ul>`
    : "";
  const questions = p.extra.questions.slice(0, 8);
  const { data, error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM || "Ariv's AI <ai@arivsai.app>",
    to: notifyRecipients(),
    subject,
    html: `<div style="font-family:sans-serif;line-height:1.6;max-width:640px">
<p><strong>Summary:</strong> ${escapeHtml(a.summary)}</p>
${line("Who (as they said it)", who || "didn't say")}
${line("Hiring for", p.extra.hiring_for)}
${line("Where", where)}
${line("Network", netText)}
${line("Came from", source)}
${line("Device", [p.ctx.device, p.ctx.browser, p.ctx.os].filter(Boolean).join(" · "))}
${line("Call length", fmtDuration(p.extra.duration_s))}
${line("Visits so far", p.history?.visits ? String(p.history.visits) : null)}
${line("Clicked", p.history?.clicks.length ? p.history.clicks.join(", ") : null)}
<p><strong>Intent:</strong> ${escapeHtml(a.intent)} &middot; <strong>Outcome:</strong> ${escapeHtml(a.outcome)} &middot; <strong>Signed in:</strong> ${p.signedIn ? "yes" : "no"}</p>
<p><strong>Topics:</strong> ${escapeHtml((a.topics || []).join(", ") || "n/a")}</p>
${questions.length ? `<p><strong>They said:</strong></p><ul>${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>` : ""}
${flagsHtml}
<p style="color:#888;font-size:12px">Location and network are approximate (from the IP address). Transcripts are assembled in the caller's browser, so treat them as unverified. Session ${escapeHtml(p.sid)}.</p>
<pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:13px">${escapeHtml(p.transcript.slice(0, 20_000))}</pre>
</div>`,
  });
  // Resend reports failures in the result instead of throwing.
  if (error) throw new Error(`resend: ${error.name ?? ""} ${error.message ?? ""}`.trim());
  return data?.id ?? null;
}
