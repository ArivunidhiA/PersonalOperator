import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { Resend } from "resend";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ARIV_EMAIL = "annaarivan.a@northeastern.edu";

interface TranscriptMessage {
  id: string;
  role: string;
  text: string;
  final: boolean;
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase || !OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.session_id || !Array.isArray(body?.messages)) {
    return NextResponse.json(
      { error: "Missing session_id or messages" },
      { status: 400 }
    );
  }

  // Caller info from Clerk login (primary source)
  const knownCallerName: string | null = body.caller_name || null;
  const knownCallerEmail: string | null = body.caller_email || null;

  const messages: TranscriptMessage[] = body.messages.filter(
    (m: TranscriptMessage) => m.final && m.text.trim()
  );

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Caller" : "Ariv's AI"}: ${m.text}`)
    .join("\n");

  // Use GPT to summarize and extract intent
  const analysisRes = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
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
- "topics": array of key topics discussed (e.g. ["Hyundai project", "Python skills", "scheduling"])
- "outcome": one of "meeting_scheduled", "info_provided", "follow_up_needed", "dropped_off"
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: transcript,
          },
        ],
        temperature: 0.1,
      }),
    }
  );

  let analysis = {
    summary: "Call completed.",
    intent: "unknown",
    caller_name: null as string | null,
    caller_email: null as string | null,
    company: null as string | null,
    topics: [] as string[],
    outcome: "info_provided",
  };

  if (analysisRes.ok) {
    const data = await analysisRes.json();
    try {
      analysis = JSON.parse(data.choices[0].message.content);
    } catch {
      // keep defaults
    }
  }

  // Use Clerk login info as primary, GPT extraction as fallback
  const finalCallerName = knownCallerName || analysis.caller_name;
  const finalCallerEmail = knownCallerEmail || analysis.caller_email;

  // Save call summary
  const { error: summaryError } = await supabase
    .from("call_summaries")
    .insert({
      session_id: body.session_id,
      caller_name: finalCallerName,
      caller_email: finalCallerEmail,
      intent: analysis.intent,
      summary: analysis.summary,
      topics: analysis.topics,
      transcript: messages,
      outcome: analysis.outcome,
    });

  if (summaryError) {
    console.error("Error saving call summary:", summaryError);
  }

  // Update caller memory if we have an email
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
          <p><strong>Topics:</strong> ${analysis.topics.join(", ") || "N/A"}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
          <p><strong>Summary:</strong></p>
          <p>${analysis.summary}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
          <p><strong>Full Transcript:</strong></p>
          <pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap;">${transcript}</pre>
        </div>
      `,
      })
      .catch((err) => console.error("Error emailing summary:", err));
  }

  return NextResponse.json({
    ok: true,
    summary: analysis.summary,
    intent: analysis.intent,
    outcome: analysis.outcome,
  });
}
