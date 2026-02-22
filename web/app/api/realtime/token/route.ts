import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRateLimiter } from "@/lib/rate-limit";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { REALTIME_TOOLS } from "@/lib/realtime-tools";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export async function POST() {
  let userId: string | null = null;

  if (clerkEnabled) {
    const session = await auth();
    userId = session.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const rateLimiter = getRateLimiter();
  if (rateLimiter) {
    const rateLimitKey = userId ?? "anonymous";
    const { success, remaining, reset } = await rateLimiter.limit(rateLimitKey);
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
          },
        }
      );
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 }
    );
  }

  const sessionConfig = {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: "gpt-realtime",
      output_modalities: ["audio"],
      instructions: SYSTEM_PROMPT,
      tools: REALTIME_TOOLS,
      tool_choice: "auto",
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
            silence_duration_ms: 1200,
            threshold: 0.6,
            prefix_padding_ms: 500,
          },
        },
        output: {
          voice: "ash",
        },
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sessionConfig),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? (data as { error: unknown }).error
        : data;
    return NextResponse.json(
      { error: message ?? "Failed to mint Realtime token" },
      { status: response.status }
    );
  }

  if (!data || typeof data.value !== "string") {
    return NextResponse.json(
      { error: "Unexpected response from OpenAI" },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      value: data.value as string,
      expires_at: data.expires_at as number,
    },
    { status: 200 }
  );
}
