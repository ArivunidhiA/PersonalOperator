import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export async function POST(req: Request) {
  let userId: string | null = null;

  if (clerkEnabled) {
    const session = await auth();
    userId = session.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    !Array.isArray(body.messages) ||
    typeof body.session_id !== "string"
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabase.from("conversations").upsert(
    {
      session_id: body.session_id,
      user_id: userId ?? "anonymous",
      messages: body.messages,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" }
  );

  if (error) {
    console.error("Supabase upsert error:", error);
    return NextResponse.json(
      { error: "Failed to save conversation" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  let userId: string | null = null;

  if (clerkEnabled) {
    const session = await auth();
    userId = session.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const query = supabase
    .from("conversations")
    .select("session_id, messages, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (userId) {
    query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase query error:", error);
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    );
  }

  return NextResponse.json({ conversations: data });
}
