import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getRedis } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Check = "ok" | "fail" | "unconfigured";

const withTimeout = <T,>(p: PromiseLike<T>, ms = 3000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function checkSupabase(): Promise<Check> {
  const db = getSupabase();
  if (!db) return "unconfigured";
  try {
    const { error } = await withTimeout(db.from("site_events").select("id", { head: true, count: "estimated" }).limit(1));
    return error ? "fail" : "ok";
  } catch {
    return "fail";
  }
}

async function checkRedis(): Promise<Check> {
  const r = getRedis();
  if (!r) return "unconfigured";
  try {
    await withTimeout(r.ping());
    return "ok";
  } catch {
    return "fail";
  }
}

/** Liveness + dependency check for uptime monitors. Reads config presence only; never mints a token or calls Gemini. */
export async function GET() {
  const [supabase, redis] = await Promise.all([checkSupabase(), checkRedis()]);
  const gemini: Check = process.env.GEMINI_API_KEY ? "ok" : "fail";
  // Redis has an in-memory fallback, so unconfigured is tolerated; configured-but-down is not.
  const healthy = supabase === "ok" && gemini === "ok" && redis !== "fail";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks: { supabase, redis, gemini } },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
