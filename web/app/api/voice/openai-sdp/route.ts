import { buildOpenAISession } from "@/lib/voice-config";
import { verifyTicket } from "@/lib/session-ticket";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 15;

const log = createLogger({ tool: "openai-sdp" });

/**
 * Optional paid fallback: exchanges the browser's WebRTC offer with OpenAI
 * using the server key, with the session (prompt, tools, voice) set here.
 */
export async function POST(req: Request) {
  const ticket = verifyTicket(req.headers.get("x-session-ticket"));
  if (!ticket || ticket.p !== "openai") return new Response("Unauthorized", { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return new Response("Voice fallback not configured", { status: 503 });

  const sdp = await req.text();
  if (!sdp.startsWith("v=0") || sdp.length > 20_000) return new Response("Bad offer", { status: 400 });

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
