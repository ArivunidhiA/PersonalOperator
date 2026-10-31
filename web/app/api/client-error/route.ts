import { NextResponse } from "next/server";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import { clientErrorSchema } from "@/lib/schemas";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const done = () => new NextResponse(null, { status: 204 });

/** Browser error reports (best effort, always 204): same-origin only, 4 KB cap, rate limited per IP. */
export async function POST(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 4096) return done();
    const parsed = clientErrorSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return done();
    if (!(await checkLimit("clientError", clientIp(req))).ok) return done();
    const supabase = getSupabase();
    if (!supabase) return done();
    await supabase.from("client_errors").insert({
      ...parsed.data,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });
  } catch {
    /* reporting never fails the page */
  }
  return done();
}
