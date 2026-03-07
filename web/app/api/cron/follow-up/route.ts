import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { Resend } from "resend";
import { createLogger } from "@/lib/logger";

const log = createLogger({ tool: "follow-up-cron" });
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://arivsai.app";
const SCHEDULING_URL = "https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat";

/**
 * Vercel Cron job: runs every hour, finds calls from 24+ hours ago
 * where no meeting was booked and no follow-up email was sent.
 * Sends a personalized follow-up email to the caller.
 */
export async function GET(req: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase || !RESEND_API_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const resend = new Resend(RESEND_API_KEY);

  // Find calls older than 24h with no meeting + no follow-up sent
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const maxAge = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: calls, error: fetchError } = await supabase
    .from("call_summaries")
    .select("id, session_id, caller_name, caller_email, company, intent, summary, topics, outcome, share_token, created_at")
    .eq("follow_up_sent", false)
    .neq("outcome", "meeting_scheduled")
    .not("caller_email", "is", null)
    .lt("created_at", cutoff)
    .gt("created_at", maxAge)
    .limit(20);

  if (fetchError) {
    log.error("Failed to fetch calls for follow-up", { error: fetchError.message });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!calls || calls.length === 0) {
    log.info("No calls eligible for follow-up");
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;

  for (const call of calls) {
    if (!call.caller_email) continue;

    const firstName = call.caller_name?.split(" ")[0] || "there";
    const topicsStr = call.topics?.length
      ? call.topics.slice(0, 3).join(", ")
      : "Ariv's background";

    const transcriptLink = call.share_token
      ? `${APP_URL}/call/${call.share_token}`
      : null;

    try {
      await resend.emails.send({
        from: "Ariv's AI <onboarding@resend.dev>",
        to: call.caller_email,
        subject: `Great chatting${call.company ? ` about the ${call.company} opportunity` : ""} — let's keep the conversation going`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; max-width: 560px; color: #333;">
            <p>Hey ${firstName},</p>
            <p>Really enjoyed our conversation about ${topicsStr}. Ariv's definitely interested in learning more.</p>
            ${call.company ? `<p>The ${call.company} opportunity sounds like a great fit based on what we discussed.</p>` : ""}
            <p>If you'd like to set up a time to chat with Ariv directly, here's his calendar:</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${SCHEDULING_URL}" style="background: #3b82f6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">Book a Meeting with Ariv</a>
            </p>
            ${transcriptLink ? `<p style="font-size: 13px; color: #888;">You can also <a href="${transcriptLink}" style="color: #3b82f6;">review our conversation here</a>.</p>` : ""}
            <p style="margin-top: 24px; color: #666;">Best,<br/>Ariv's AI</p>
          </div>
        `,
      });

      await supabase
        .from("call_summaries")
        .update({
          follow_up_sent: true,
          follow_up_sent_at: new Date().toISOString(),
        })
        .eq("id", call.id);

      sent++;
      log.info("Follow-up email sent", {
        callerId: call.caller_email,
        sessionId: call.session_id,
      });
    } catch (err) {
      log.error("Follow-up email failed", {
        callerId: call.caller_email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("Follow-up cron complete", { eligible: calls.length, sent });
  return NextResponse.json({ eligible: calls.length, sent });
}
