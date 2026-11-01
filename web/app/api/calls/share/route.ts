import { NextResponse } from "next/server";
import { ticketFrom } from "@/lib/session-ticket";

export const runtime = "nodejs";

/**
 * New share links are off. Transcripts are assembled in the browser, so a link
 * had to be gated on a fact check, and any answer that depends on that check
 * confirms a guessed confidential name. Existing links keep working until they
 * expire. Don't bring this back without a transcript the server saw itself.
 */
export async function POST(req: Request) {
  if (!ticketFrom(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "Share links are off." }, { status: 410 });
}
