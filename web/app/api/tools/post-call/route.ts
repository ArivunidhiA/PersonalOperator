import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { Resend } from "resend";
import { storeMemory } from "@/lib/semantic-memory";
import { createLogger } from "@/lib/logger";
import { randomBytes } from "crypto";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ARIV_EMAIL = "annaarivan.a@northeastern.edu";

const log = createLogger({ tool: "post-call" });

interface TranscriptMessage {
  id: string;
  role: string;
  text: string;
  final: boolean;
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase || !OPENAI_API_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.session_id || !Array.isArray(body?.messages)) {
    return NextResponse.json(
      { error: "Missing session_id or messages" },
      { status: 400 },
    );
  }

  const sessionId = body.session_id as string;
  const slog = log.child({ sessionId });

  const knownCallerName: string | null = body.caller_name || null;
  const knownCallerEmail: string | null = body.caller_email || null;

  const messages: TranscriptMessage[] = body.messages.filter(
    (m: TranscriptMessage) => m.final && m.text.trim(),
  );

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Caller" : "Ariv's AI"}: ${m.text}`)
    .join("\n");

  // GPT-powered transcript analysis
  const analysis = await slog.time("transcript-analysis", async () => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analyze this call transcript. Return JSON with:
- "summary": 2-3 sentence summary of what was discussed
- "intent": one of "recruiter", "hiring_manager", "technical_interview", "general_inquiry", "scheduling", "unknown"
- "caller_name": caller's name if mentioned, or null
- "caller_email": caller's email if mentioned, or null
- "company": caller's company if mentioned, or null
- "role": role being discussed if mentioned, or null
- "topics": array of key topics discussed
- "outcome": one of "meeting_scheduled", "info_provided", "follow_up_needed", "dropped_off"
- "sentiment": one of "positive", "neutral", "negative", "very_positive"
Return ONLY valid JSON, no markdown.`,
          },
          { role: "user", content: transcript },
        ],
        temperature: 0.1,
      }),
    });

    const defaults = {
      summary: "Call completed.",
      intent: "unknown",
      caller_name: null as string | null,
      caller_email: null as string | null,
      company: null as string | null,
      role: null as string | null,
      topics: [] as string[],
      outcome: "info_provided",
      sentiment: "neutral",
    };

    if (!res.ok) return defaults;
    const data = await res.json();
    try {
      return { ...defaults, ...JSON.parse(data.choices[0].message.content) };
    } catch {
      return defaults;
    }
  });

  const finalCallerName = knownCallerName || analysis.caller_name;
  const finalCallerEmail = knownCallerEmail || analysis.caller_email;

  // Generate shareable transcript token
  const shareToken = randomBytes(16).toString("hex");

  // Save call summary (with share_token and company)
  const { error: summaryError } = await supabase.from("call_summaries").insert({
    session_id: sessionId,
    caller_name: finalCallerName,
    caller_email: finalCallerEmail,
    intent: analysis.intent,
    summary: analysis.summary,
    topics: analysis.topics,
    transcript: messages,
    outcome: analysis.outcome,
    company: analysis.company,
    share_token: shareToken,
    follow_up_sent: false,
  });

  if (summaryError) {
    slog.error("Failed to save call summary", { error: summaryError.message });
  }

  // Create share token record
  await supabase.from("share_tokens").insert({
    token: shareToken,
    session_id: sessionId,
  });

  // Store semantic memory for this caller
  if (finalCallerEmail) {
    await storeMemory({
      callerEmail: finalCallerEmail,
      sessionId,
      summary: analysis.summary,
      topics: analysis.topics,
      sentiment: analysis.sentiment,
    });
  }

  // Update caller record
  if (finalCallerEmail) {
    const { data: existingCaller } = await supabase
      .from("callers")
      .select("id, call_count")
      .eq("email", finalCallerEmail)
      .single();

    if (existingCaller) {
      await supabase
        .from("callers")
        .update({
          name: finalCallerName || undefined,
          company: analysis.company || undefined,
          role: analysis.role || undefined,
          call_count: (existingCaller.call_count || 1) + 1,
          last_topics: analysis.topics,
          last_summary: analysis.summary,
          last_seen: new Date().toISOString(),
        })
        .eq("id", existingCaller.id);
    } else {
      await supabase.from("callers").insert({
        email: finalCallerEmail,
        name: finalCallerName,
        company: analysis.company,
        role: analysis.role,
        interests: analysis.topics,
        last_topics: analysis.topics,
        last_summary: analysis.summary,
      });
    }
  }

  // Email summary to Ariv
  if (RESEND_API_KEY) {
    const resend = new Resend(RESEND_API_KEY);
    const callerInfo = finalCallerName
      ? `${finalCallerName}${analysis.company ? ` (${analysis.company})` : ""}`
      : "Unknown caller";

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://arivsai.app"}/call/${shareToken}`;

    await resend.emails
      .send({
        from: "Ariv's AI <onboarding@resend.dev>",
        to: ARIV_EMAIL,
        subject: `Call Summary: ${callerInfo} — ${analysis.intent}`,
        html: `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
          <h2 style="color: #333;">Call Summary</h2>
          <p><strong>Caller:</strong> ${callerInfo}</p>
          ${finalCallerEmail ? `<p><strong>Email:</strong> ${finalCallerEmail}</p>` : ""}
          <p><strong>Intent:</strong> ${analysis.intent}</p>
          <p><strong>Outcome:</strong> ${analysis.outcome}</p>
          <p><strong>Sentiment:</strong> ${analysis.sentiment}</p>
          <p><strong>Topics:</strong> ${analysis.topics.join(", ") || "N/A"}</p>
          ${analysis.company ? `<p><strong>Company:</strong> ${analysis.company}</p>` : ""}
          ${analysis.role ? `<p><strong>Role:</strong> ${analysis.role}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
          <p><strong>Summary:</strong></p>
          <p>${analysis.summary}</p>
          <p><a href="${shareUrl}" style="color: #3b82f6;">View full transcript &rarr;</a></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
          <p><strong>Full Transcript:</strong></p>
          <pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap;">${transcript}</pre>
        </div>
      `,
      })
      .catch((err) => slog.error("Email send failed", { error: String(err) }));
  }

  slog.info("Post-call processing complete", {
    callerId: finalCallerEmail,
    intent: analysis.intent,
    outcome: analysis.outcome,
    shareToken,
  });

  return NextResponse.json({
    ok: true,
    summary: analysis.summary,
    intent: analysis.intent,
    outcome: analysis.outcome,
    share_token: shareToken,
  });
}
