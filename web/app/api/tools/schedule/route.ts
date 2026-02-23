import { NextResponse } from "next/server";

const BASE_SCHEDULING_URL =
  "https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.start_time || !body?.name || !body?.email) {
    return NextResponse.json(
      { error: "Missing start_time, name, or email" },
      { status: 400 }
    );
  }

  // Build a pre-filled Calendly link with name, email, and target month
  const startDate = new Date(body.start_time);
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, "0");

  // Format the time nicely for display
  const confirmedTime = startDate.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

  // Calendly pre-fill params: name, email, month (YYYY-MM)
  const params = new URLSearchParams();
  params.set("name", body.name);
  params.set("email", body.email);
  params.set("month", `${year}-${month}`);

  const bookingLink = `${BASE_SCHEDULING_URL}?${params.toString()}`;

  return NextResponse.json({
    success: true,
    booking_link: bookingLink,
    suggested_time: confirmedTime,
    message: `Here's a booking link for ${body.name} with their info pre-filled. The caller just needs to pick ${confirmedTime} and confirm. One click and they're booked.`,
  });
}
