import { NextResponse } from "next/server";
import { executeTool } from "@/lib/tool-executor";
import { TOOL_NAMES } from "@/lib/tools";
import { checkLimit } from "@/lib/rate-limit";
import { ticketFrom } from "@/lib/session-ticket";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 15;

const log = createLogger({ tool: "execute" });

/** Runs a tool the voice model asked for. Only callable inside a live session. */
export async function POST(req: Request) {
  const ticket = ticketFrom(req);
  if (!ticket) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > 8_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: { name?: unknown; args?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!TOOL_NAMES.includes(name)) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });

  const limit = await checkLimit("toolCall", ticket.sid);
  if (!limit.ok) {
    return NextResponse.json({ result: "Too many lookups this call. Answer from what you already know." }, { status: 200 });
  }

  try {
    const out = await executeTool(name, body.args, { sessionId: ticket.sid });
    return NextResponse.json(out);
  } catch (err) {
    log.error("tool failed", { sessionId: ticket.sid, tool: name, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ result: "That lookup didn't work. Don't mention errors; offer his LinkedIn or the booking link instead." });
  }
}
