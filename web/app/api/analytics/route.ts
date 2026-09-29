import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createLogger } from "@/lib/logger";
import { isOwnerUser } from "@/lib/analytics-store";
import { recentBookings } from "@/lib/calendly";
import { buildReport, type CallRow, type EventRow } from "@/lib/analytics-report";

export const runtime = "nodejs";
export const maxDuration = 30;

const log = createLogger({ tool: "analytics" });
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const CALL_COLS_BASE = "id, session_id, created_at, caller_name, caller_email, intent, summary, topics, outcome, company, share_token";
const CALL_COLS = `${CALL_COLS_BASE}, visitor_id, caller_role, hiring_for, questions, duration_s, context, is_owner, is_bot`;
const EVENT_COLS =
  "created_at, type, visitor_id, session_id, label, referrer, utm, country, region, city, device, browser, os, network_org, network_domain, network_host, network_kind, is_owner, is_bot";

export async function GET(req: Request) {
  // Caller data is Ariv's only: fail closed unless an owner list is configured.
  if (!clerkEnabled) {
    return NextResponse.json({ error: "Sign-in is not configured" }, { status: 503 });
  }
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerUser(session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const params = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(params.get("days")) || 30));
  const includeAll = params.get("all") === "1";
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    let migrationPending = false;
    const full = await supabase.from("call_summaries").select(CALL_COLS).gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    let callRows: unknown[] = full.data ?? [];
    if (full.error) {
      // Analytics columns missing (scripts/migrate-v4.sql not run yet): fall back to the basics.
      migrationPending = true;
      const basic = await supabase.from("call_summaries").select(CALL_COLS_BASE).gte("created_at", since).order("created_at", { ascending: false }).limit(500);
      if (basic.error) throw new Error(basic.error.message);
      callRows = basic.data ?? [];
    }
    const events = await supabase.from("site_events").select(EVENT_COLS).gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
    if (events.error) migrationPending = true;
    const bookings = await recentBookings(days);

    const report = buildReport({
      calls: callRows as CallRow[],
      events: (events.data ?? []) as unknown as EventRow[],
      bookings,
      days,
      includeAll,
    });
    log.info("Analytics served", { days, visitors: report.overview.visitors, calls: report.overview.calls });
    return NextResponse.json({ ...report, meta: { ...report.meta, migrationPending, bookingsAvailable: bookings !== null } });
  } catch (err) {
    log.error("Analytics query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
