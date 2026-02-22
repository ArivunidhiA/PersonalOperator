import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const { data: caller } = await supabase
    .from("callers")
    .select("*")
    .eq("email", body.email)
    .single();

  if (!caller) {
    return NextResponse.json({ found: false });
  }

  // Also get their recent call summaries
  const { data: recentCalls } = await supabase
    .from("call_summaries")
    .select("summary, topics, intent, outcome, created_at")
    .eq("caller_email", body.email)
    .order("created_at", { ascending: false })
    .limit(3);

  return NextResponse.json({
    found: true,
    caller: {
      name: caller.name,
      email: caller.email,
      company: caller.company,
      role: caller.role,
      call_count: caller.call_count,
      last_topics: caller.last_topics,
      last_summary: caller.last_summary,
      first_seen: caller.first_seen,
      last_seen: caller.last_seen,
    },
    recent_calls: recentCalls || [],
  });
}
