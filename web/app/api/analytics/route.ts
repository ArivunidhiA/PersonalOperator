import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createLogger } from "@/lib/logger";

const log = createLogger({ tool: "analytics" });
const OWNER_USER_IDS = (process.env.ANALYTICS_OWNER_IDS || "").split(",").filter(Boolean);
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export async function GET() {
  if (clerkEnabled) {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (OWNER_USER_IDS.length > 0 && !OWNER_USER_IDS.includes(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const [
      callsResult,
      callersResult,
      recentCallsResult,
    ] = await Promise.all([
      supabase
        .from("call_summaries")
        .select("id, session_id, caller_name, caller_email, intent, summary, topics, outcome, company, created_at, follow_up_sent, share_token")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("callers")
        .select("id, email, name, company, role, call_count, last_topics, first_seen, last_seen")
        .order("last_seen", { ascending: false })
        .limit(100),
      supabase
        .from("call_summaries")
        .select("id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const calls = callsResult.data || [];
    const callers = callersResult.data || [];
    const allCalls = recentCallsResult.data || [];

    // Compute aggregates
    const totalCalls = allCalls.length;
    const uniqueCallers = callers.length;
    const returningCallers = callers.filter((c: { call_count: number }) => c.call_count > 1).length;

    // Intent distribution
    const intentCounts: Record<string, number> = {};
    for (const c of calls) {
      const intent = (c as { intent: string }).intent || "unknown";
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    }

    // Outcome distribution
    const outcomeCounts: Record<string, number> = {};
    for (const c of calls) {
      const outcome = (c as { outcome: string }).outcome || "unknown";
      outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
    }

    // Topic frequency
    const topicCounts: Record<string, number> = {};
    for (const c of calls) {
      for (const t of ((c as { topics: string[] }).topics || [])) {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      }
    }
    const topTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([topic, count]) => ({ topic, count }));

    // Company frequency
    const companyCounts: Record<string, number> = {};
    for (const c of calls) {
      const company = (c as { company: string }).company;
      if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
    }
    const topCompanies = Object.entries(companyCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([company, count]) => ({ company, count }));

    // Calls over time (daily, last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyCounts: Record<string, number> = {};
    for (const c of allCalls) {
      const d = new Date((c as { created_at: string }).created_at);
      if (d >= thirtyDaysAgo) {
        const key = d.toISOString().split("T")[0];
        dailyCounts[key] = (dailyCounts[key] || 0) + 1;
      }
    }
    const callsOverTime = Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Conversion funnel
    const meetingsScheduled = outcomeCounts["meeting_scheduled"] || 0;
    const conversionRate = totalCalls > 0 ? ((meetingsScheduled / totalCalls) * 100).toFixed(1) : "0";

    log.info("Analytics served", { totalCalls, uniqueCallers });

    return NextResponse.json({
      overview: {
        totalCalls,
        uniqueCallers,
        returningCallers,
        meetingsScheduled,
        conversionRate: `${conversionRate}%`,
      },
      intentDistribution: intentCounts,
      outcomeDistribution: outcomeCounts,
      topTopics,
      topCompanies,
      callsOverTime,
      recentCalls: calls.slice(0, 20).map((c) => ({
        ...(c as object),
      })),
      topCallers: callers.slice(0, 10),
    });
  } catch (err) {
    log.error("Analytics query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
