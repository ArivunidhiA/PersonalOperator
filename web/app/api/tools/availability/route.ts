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

  const body = await req.json().catch(() => null);
  const startDate = body?.start_date || new Date().toISOString().split("T")[0];

  const startTime = `${startDate}T00:00:00.000000Z`;
  const end = new Date(startDate);
  end.setDate(end.getDate() + 7);
  const endTime = `${end.toISOString().split("T")[0]}T23:59:59.000000Z`;

  const url = new URL("https://api.calendly.com/event_type_available_times");
  url.searchParams.set("event_type", EVENT_TYPE_URI);
  url.searchParams.set("start_time", startTime);
  url.searchParams.set("end_time", endTime);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${CALENDLY_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Calendly availability error:", text);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 502 }
    );
  }

  const data = await res.json();
  const slots = (data.collection || [])
    .filter((s: { status: string }) => s.status === "available")
    .slice(0, 10)
    .map((s: { start_time: string }) => s.start_time);

  return NextResponse.json({ slots });
}
