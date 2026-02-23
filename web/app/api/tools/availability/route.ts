import { NextResponse } from "next/server";

const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
const EVENT_TYPE_URI =
  "https://api.calendly.com/event_types/8ad36e18-41a3-4b69-a3dd-7b86afe88a5d";

export async function POST(req: Request) {
  if (!CALENDLY_API_KEY) {
    return NextResponse.json(
      { error: "Calendly not configured" },
      { status: 503 }
    );
  }

  const SCHEDULING_URL =
    "https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat";

  const body = await req.json().catch(() => null);

  // Calendly requires start_time to be strictly in the future
  const now = new Date();
  let start: Date;
  if (body?.start_date) {
    const parsed = new Date(body.start_date + "T00:00:00Z");
    // If the requested date is today or in the past, use now + 1 minute
    start = parsed > now ? parsed : new Date(now.getTime() + 60_000);
  } else {
    start = new Date(now.getTime() + 60_000);
  }

  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const url = new URL("https://api.calendly.com/event_type_available_times");
  url.searchParams.set("event_type", EVENT_TYPE_URI);
  url.searchParams.set("start_time", start.toISOString());
  url.searchParams.set("end_time", end.toISOString());

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${CALENDLY_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Calendly availability error:", res.status, text);
    // Even if the API fails, give the AI the direct link so it can still help
    return NextResponse.json({
      slots: [],
      scheduling_url: SCHEDULING_URL,
      note: "Could not fetch live availability, but the caller can book directly at the scheduling URL.",
    });
  }

  const data = await res.json();

  // Filter to 10am-5pm EST only (UTC-5 = 15:00-22:00 UTC)
  const slots = (data.collection || [])
    .filter((s: { status: string; start_time: string }) => {
      if (s.status !== "available") return false;
      const hour = new Date(s.start_time).getUTCHours();
      // 10am EST = 15 UTC, 5pm EST = 22 UTC (last slot at 4:30pm = 21:30 UTC)
      return hour >= 15 && hour < 22;
    })
    .slice(0, 10)
    .map((s: { start_time: string }) => s.start_time);

  // Build helpful context for the AI
  let note: string | undefined;
  if (slots.length === 0) {
    note = "No slots found in the next 7 days between 10am-5pm EST. This could mean the calendar is fully booked this week OR the API returned no data. Tell the caller: 'His calendar looks pretty full this week, but it's generally open. Let me send you his booking link so you can pick a time that works.' Share the scheduling_url.";
  }

  // Group slots by day for easier AI consumption
  const slotsByDay: Record<string, string[]> = {};
  for (const s of slots) {
    const day = new Date(s).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });
    if (!slotsByDay[day]) slotsByDay[day] = [];
    slotsByDay[day].push(
      new Date(s).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    );
  }

  return NextResponse.json({
    slots,
    slots_by_day: slotsByDay,
    scheduling_url: SCHEDULING_URL,
    total_slots: slots.length,
    note,
    guidance: slots.length > 0
      ? `Found ${slots.length} available slots across ${Object.keys(slotsByDay).length} days (${Object.keys(slotsByDay).join(", ")}). IMPORTANT: Mention ALL available days, not just the first one. Say something like "He's got time on ${Object.keys(slotsByDay).join(", ")}, what day works best for you?" If the caller asks for a specific day, check if that day is in the list above. If it is, offer those times. Don't say a day is unavailable if it has slots.`
      : undefined,
  });
}
