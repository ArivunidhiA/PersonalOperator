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

  // Build a pre-filled Calendly link with name, email, and target date
  const startDate = new Date(body.start_time);
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, "0");
  const day = String(startDate.getDate()).padStart(2, "0");

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

  // Calendly pre-fill: name & email as query params, date in path
  // Encoding name with %20 for spaces (not +) for better Calendly compatibility
  const encodedName = encodeURIComponent(body.name);
  const encodedEmail = encodeURIComponent(body.email);

  const bookingLink = `${BASE_SCHEDULING_URL}/${year}-${month}-${day}?name=${encodedName}&email=${encodedEmail}`;

  return NextResponse.json({
    success: true,
    booking_link: bookingLink,
    suggested_time: confirmedTime,
    message: `Here's a booking link for ${body.name} with their info pre-filled. The caller just needs to pick ${confirmedTime} and confirm. One click and they're booked.`,
  });
}
