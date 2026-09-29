import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import { checkLimit } from "@/lib/rate-limit";
import { ticketFrom } from "@/lib/session-ticket";
import { escapeHtml } from "@/lib/html";
import { LINKS } from "@/lib/knowledge";

export const runtime = "nodejs";

/**
 * "Email me this transcript": the one email a caller can trigger, and only to
 * their own Clerk-verified address, only for their own call, on request.
 * Replaces the old open relay and the unsolicited follow-up cron.
 */
export async function POST(req: Request) {
  const ticket = ticketFrom(req);
  if (!ticket) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ticket.uid || !ticket.em) {
    return NextResponse.json({ error: "Sign in with a verified email to get the transcript by email." }, { status: 403 });
  }
  const key = process.env.RESEND_API_KEY;
  const supabase = getSupabase();
  if (!key || !supabase) return NextResponse.json({ error: "Email isn't set up" }, { status: 503 });
  if (!(await checkLimit("emailTranscript", ticket.uid)).ok) {
    return NextResponse.json({ error: "You've emailed a few transcripts today already." }, { status: 429 });
  }

  const { data: call } = await supabase
    .from("call_summaries")
    .select("summary, transcript, share_token")
    .eq("session_id", ticket.sid)
    .maybeSingle();
  if (!call) return NextResponse.json({ error: "Call not saved yet" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://arivsai.app";
  const lines = ((call.transcript || []) as { role: string; text: string }[])
    .map((m) => `<p><strong>${m.role === "user" ? "You" : "Ariv's AI"}:</strong> ${escapeHtml(m.text)}</p>`)
    .join("");
  const { error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM || "Ariv's AI <ai@arivsai.app>",
    to: ticket.em,
    subject: "Your conversation with Ariv's AI",
    html: `<div style="font-family:sans-serif;line-height:1.6;max-width:640px">
<p>Here's the transcript you asked for. If you want to talk to Ariv himself, you can <a href="${LINKS.calendly}">book 15 minutes</a> or find him on <a href="${LINKS.linkedin}">LinkedIn</a>.</p>
${call.summary ? `<p><em>${escapeHtml(call.summary)}</em></p>` : ""}
${lines}
${call.share_token ? `<p><a href="${escapeHtml(`${appUrl}/call/${call.share_token}`)}">View it online</a></p>` : ""}
<p style="color:#888;font-size:12px">Sent because you pressed "Email me the transcript" on arivsai.app.</p>
</div>`,
  });
  if (error) return NextResponse.json({ error: "Couldn't send the email" }, { status: 502 });
  return NextResponse.json({ ok: true, to: ticket.em });
}
