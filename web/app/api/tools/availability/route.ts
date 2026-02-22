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
  const slots = (data.collection || [])
    .filter((s: { status: string }) => s.status === "available")
    .slice(0, 10)
    .map((s: { start_time: string }) => s.start_time);

  return NextResponse.json({
    slots,
    scheduling_url: SCHEDULING_URL,
    note:
      slots.length === 0
        ? "No specific slots returned by the API, but Ariv's calendar is generally open. Direct the caller to the scheduling URL to pick a time."
        : undefined,
  });
}
