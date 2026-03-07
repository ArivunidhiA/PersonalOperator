import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRateLimiter, getAnonymousRateLimiter } from "@/lib/rate-limit";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { REALTIME_TOOLS } from "@/lib/realtime-tools";
import { recallMemories } from "@/lib/semantic-memory";
import { hybridSearch } from "@/lib/hybrid-rag";
import { getSupabase } from "@/lib/supabase";
import { createLogger } from "@/lib/logger";

const log = createLogger({ tool: "connect" });
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const maxDuration = 30;

/**
 * Unified connect endpoint:
 * 1. Authenticates the user
 * 2. Mints an ephemeral OpenAI Realtime token
 * 3. Proxies the SDP exchange to get the call_id
 * 4. Returns SDP answer + call_id to the client
 * 5. Injects proactive context (caller memory + pre-loaded knowledge)
 */
export async function POST(req: Request) {
  let userId: string | null = null;

  if (clerkEnabled) {
    const session = await auth();
    userId = session?.userId ?? null;
  }

  const body = await req.json().catch(() => null);
  const callerName = body?.caller_name || "";
  const callerEmail = body?.caller_email || "";
  const sdpOffer = body?.sdp_offer || "";

  if (!sdpOffer) {
    return NextResponse.json({ error: "Missing SDP offer" }, { status: 400 });
  }

  // Rate limiting: stricter for anonymous (3/hour), normal for signed-in (10/min)
  const rateLimiter = userId ? getRateLimiter() : getAnonymousRateLimiter();
  if (rateLimiter) {
    const key = userId ?? `anon:${req.headers.get("x-forwarded-for") ?? "unknown"}`;
    const { success, remaining, reset } = await rateLimiter.limit(key);
    if (!success) {
      const friendlyMsg = userId
        ? "You've used your session limit for now. Try again in a few minutes."
        : "You've reached the limit for guest sessions. Sign in for more, or try again in an hour.";
      return NextResponse.json(
        { error: friendlyMsg },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
          },
        },
      );
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 },
    );
  }

  // Proactive pre-loading: build enriched context for known callers
  let callerContext = "";
  if (callerName || callerEmail) {
    callerContext += `\n\nCALLER INFO (from their login, already verified):\n`;
    if (callerName) callerContext += `Name: ${callerName}\n`;
    if (callerEmail) callerContext += `Email: ${callerEmail}\n`;
    callerContext += `You already know who this person is. Do NOT ask for their name or email again. When booking a meeting, just confirm: "I have your email as ${callerEmail}, should I use that?" and proceed.\nUse their first name naturally but only AFTER they speak first. Do NOT call any tools until the caller has spoken. When they mention scheduling or you want to personalize, THEN call lookup_caller with email "${callerEmail}".`;
  }

  // Proactive knowledge pre-loading for returning callers
  if (callerEmail) {
    try {
      const supabase = getSupabase();
      const [memories, caller] = await Promise.all([
        recallMemories(callerEmail, "previous conversations and interests", 3),
        supabase
          ? supabase
              .from("callers")
              .select("name, company, role, call_count, last_topics, last_summary")
              .eq("email", callerEmail)
              .single()
              .then((r) => r.data)
          : null,
      ]);

      if (caller && caller.call_count > 0) {
        callerContext += `\n\nRETURNING CALLER CONTEXT (pre-loaded, don't mention that you "looked this up"):`;
        callerContext += `\nThis is call #${(caller.call_count || 0) + 1} from ${caller.name || callerName}.`;
        if (caller.company)
          callerContext += ` Works at ${caller.company}.`;
        if (caller.role)
          callerContext += ` Previously interested in: ${caller.role}.`;
        if (caller.last_topics?.length)
          callerContext += `\nLast time they asked about: ${caller.last_topics.join(", ")}.`;
        if (caller.last_summary)
          callerContext += `\nPrevious call summary: ${caller.last_summary}`;
      }

      if (memories.length > 0) {
        callerContext += `\n\nSEMANTIC MEMORY (relevant past interactions):`;
        for (const m of memories) {
          callerContext += `\n- ${m.summary} (mood: ${m.sentiment})`;
        }
      }

      // Pre-load knowledge relevant to their past interests
      if (caller?.last_topics?.length) {
        const topicQuery = caller.last_topics.slice(0, 3).join(", ");
        const preloaded = await hybridSearch(topicQuery, 2);
        if (preloaded.length > 0) {
          callerContext += `\n\nPRE-LOADED KNOWLEDGE (relevant to their interests, use naturally):`;
          for (const r of preloaded) {
            callerContext += `\n${r.content.slice(0, 200)}...`;
          }
        }
      }
    } catch (err) {
      log.warn("Proactive pre-loading failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const instructions = SYSTEM_PROMPT + callerContext;

  // Step 1: Mint ephemeral token
  const sessionConfig = {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: "gpt-realtime",
      output_modalities: ["audio"],
      instructions,
      tools: REALTIME_TOOLS,
      tool_choice: "auto",
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
            prompt:
              "The speaker is most likely speaking English, but may switch to other languages.",
          },
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
            silence_duration_ms: 2000,
            threshold: 0.8,
            prefix_padding_ms: 600,
          },
        },
        output: {
          voice: "cedar",
        },
      },
    },
  };

  const tokenRes = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    },
  );

  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.value) {
    const openAiError =
      (tokenData && typeof tokenData === "object" && "error" in tokenData
        ? (tokenData.error as { message?: string })?.message ?? JSON.stringify(tokenData.error)
        : null) || "Failed to mint Realtime token";
    log.error("Token minting failed", {
      status: tokenRes.status,
      error: tokenData,
    });
    return NextResponse.json(
      { error: openAiError },
      { status: tokenRes.status },
    );
  }

  // Step 2: Proxy SDP exchange to get call_id
  const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.value}`,
      "Content-Type": "application/sdp",
    },
    body: sdpOffer,
  });

  if (!sdpRes.ok) {
    const text = await sdpRes.text();
    log.error("SDP exchange failed", { status: sdpRes.status, error: text });
    return NextResponse.json(
      { error: "Failed to establish WebRTC session" },
      { status: sdpRes.status },
    );
  }

  const sdpAnswer = await sdpRes.text();
  const callId = sdpRes.headers.get("location") || "";

  log.info("Session established", {
    callId,
    callerId: callerEmail || "anonymous",
    hasPreloadedContext: callerContext.length > 200,
  });

  return NextResponse.json({
    sdp_answer: sdpAnswer,
    call_id: callId,
    expires_at: tokenData.expires_at,
  });
}
