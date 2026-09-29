import { buildOpenAISession } from "@/lib/voice-config";
import { verifyTicket } from "@/lib/session-ticket";
import { checkLimit, safeRedis } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 15;

const log = createLogger({ tool: "openai-sdp" });

/**
 * Optional paid fallback: exchanges the browser's WebRTC offer with OpenAI
 * using the server key, with the session (prompt, tools, voice) set here.
 * Paid path, so it fails closed: one call per ticket (needs Redis), and a
 * global daily cap.
 */
export async function POST(req: Request) {
  const ticket = verifyTicket(req.headers.get("x-session-ticket"));
  if (!ticket || ticket.p !== "openai") return new Response("Unauthorized", { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return new Response("Voice fallback not configured", { status: 503 });

  const sdp = await req.text();
  if (!sdp.startsWith("v=0") || sdp.length > 20_000) return new Response("Bad offer", { status: 400 });

  // One paid session per ticket. Without Redis we can't enforce that, so refuse.
  const first = await safeRedis<string | number | null>((r) => r.set(`sdp:${ticket.sid}`, 1, { nx: true, ex: 3600 }), "unavailable");
  if (first === "unavailable") return new Response("Voice fallback unavailable", { status: 503 });
  if (!first) return new Response("This call was already started", { status: 409 });
  if (!(await checkLimit("openaiDaily", "all")).ok) return new Response("Daily limit reached", { status: 429 });

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(buildOpenAISession()));
  const res = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!res || !res.ok) {
    log.error("openai sdp exchange failed", { sessionId: ticket.sid, status: res?.status, body: (await res?.text().catch(() => ""))?.slice(0, 300) });
    return new Response("Couldn't start the call", { status: 502 });
  }
  return new Response(await res.text(), { headers: { "Content-Type": "application/sdp" } });
}
