import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import { mintTicket, newSessionId } from "@/lib/session-ticket";
import { createLogger } from "@/lib/logger";
import { GREETING_NUDGE, MAX_CALL_SECONDS, chooseProvider, geminiAllowedIn } from "@/lib/voice-config";
import { GEMINI_WS_URL, mintGeminiToken } from "@/lib/gemini-token";

export const runtime = "nodejs";
export const maxDuration = 15;

const log = createLogger({ tool: "voice-session" });
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Starts a call: picks the voice engine, applies rate limits, and returns a
 * short-lived credential plus a signed session ticket. The browser connects
 * to the voice engine directly; the agent's prompt and tools are locked
 * server-side (Gemini) or set server-side in the SDP exchange (OpenAI).
 */
export async function POST(req: Request) {
  // Only our own page may start calls: a custom header forces a CORS preflight
  // (which we never allow cross-site), and browsers mark cross-site requests.
  const site = req.headers.get("sec-fetch-site");
  if (req.headers.get("x-ariv-client") !== "1" || (site && site !== "same-origin" && site !== "none")) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }
  const country = req.headers.get("x-vercel-ip-country");
  const provider = chooseProvider(country);
  if (!provider) {
    const regional = !geminiAllowedIn(country);
    return NextResponse.json(
      {
        error: regional
          ? "Voice chat isn't available in your region yet. You can still find Ariv on LinkedIn or book a call below."
          : "Voice chat is offline right now. You can still find Ariv on LinkedIn or book a call below.",
        code: regional ? "region" : "offline",
      },
      { status: regional ? 451 : 503 },
    );
  }

  let uid: string | null = null;
  let email: string | null = null;
  if (clerkEnabled) {
    try {
      uid = (await auth()).userId ?? null;
      if (uid) {
        const user = await currentUser();
        const primary = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
        email = primary?.verification?.status === "verified" ? primary.emailAddress : null;
      }
    } catch {
      uid = null;
    }
  }

  // Per-caller limit first, so one IP can't burn the shared daily cap for everyone.
  const perCaller = uid ? await checkLimit("sessionUser", uid) : await checkLimit("sessionAnon", clientIp(req));
  if (!perCaller.ok) {
    return NextResponse.json(
      { error: "You've started a lot of calls in the last hour. Give it a bit and try again.", code: "rate_limited" },
      { status: 429 },
    );
  }
  const sessionId = newSessionId();
  const ticket = mintTicket({ sid: sessionId, p: provider, uid, em: email });

  const busy = () =>
    NextResponse.json(
      { error: "The agent has hit its limit for today. Try again tomorrow, or book a call with Ariv below.", code: "busy" },
      { status: 429 },
    );

  if (provider === "openai") {
    if (!(await checkLimit("sessionGlobal", "all")).ok) return busy();
    log.info("session started", { sessionId, provider, signedIn: !!uid, country });
    return NextResponse.json({ provider, sessionId, ticket, maxCallSeconds: MAX_CALL_SECONDS });
  }

  try {
    const { token, model } = await mintGeminiToken();
    // Count against the shared daily cap only once a session is really granted.
    if (!(await checkLimit("sessionGlobal", "all")).ok) return busy();
    log.info("session started", { sessionId, provider, signedIn: !!uid, country });
    return NextResponse.json({
      provider,
      sessionId,
      ticket,
      maxCallSeconds: MAX_CALL_SECONDS,
      gemini: { token, model, wsUrl: GEMINI_WS_URL, greeting: GREETING_NUDGE },
    });
  } catch (err) {
    log.error("gemini token mint failed", { sessionId, error: err instanceof Error ? err.message.slice(0, 300) : String(err) });
    return NextResponse.json(
      { error: "Couldn't start the call right now. Try again in a minute.", code: "upstream" },
      { status: 502 },
    );
  }
}
