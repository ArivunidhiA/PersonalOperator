import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";

const log = createLogger({ tool: "cron-maintenance" });

/**
 * Daily housekeeping (Vercel cron, Hobby plan allows once a day).
 * - Always: drop expired share links.
 * - Only if RETENTION_DAYS is set: delete stored calls older than that.
 * Fails closed without CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const now = new Date().toISOString();
  const expired = await supabase.from("share_tokens").delete({ count: "exact" }).lt("expires_at", now);

  const days = Number(process.env.RETENTION_DAYS || 0);
  let conversations = 0;
  let summaries = 0;
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    const c = await supabase.from("conversations").delete({ count: "exact" }).lt("updated_at", cutoff);
    const s = await supabase.from("call_summaries").delete({ count: "exact" }).lt("created_at", cutoff);
    // Verified caller emails and legacy memories follow the same retention.
    await supabase.from("callers").delete().lt("last_seen", cutoff);
    await supabase.from("caller_memories").delete().lt("created_at", cutoff);
    // Visit and click analytics too (the table exists once scripts/migrate-v4.sql has run).
    await supabase.from("site_events").delete().lt("created_at", cutoff);
    conversations = c.count ?? 0;
    summaries = s.count ?? 0;
  }
  const result = { expiredShareLinks: expired.count ?? 0, retentionDays: days || null, conversations, summaries };
  log.info("maintenance done", result);
  return NextResponse.json(result);
}
