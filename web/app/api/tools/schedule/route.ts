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
  if (!body?.start_time || !body?.name || !body?.email) {
    return NextResponse.json(
      { error: "Missing start_time, name, or email" },
      { status: 400 }
    );
  }

  // Split name into first/last
  const nameParts = body.name.trim().split(/\s+/);
  const firstName = nameParts[0] || body.name;
  const lastName = nameParts.slice(1).join(" ") || "";

  const inviteePayload: Record<string, unknown> = {
    event_type: EVENT_TYPE_URI,
    start_time: body.start_time,
    invitee: {
      name: body.name,
      first_name: firstName,
      last_name: lastName,
      email: body.email,
      timezone: "America/New_York",
    },
  };

  if (body.notes) {
    inviteePayload.questions_and_answers = [
      { question: "Notes", answer: body.notes, position: 0 },
    ];
  }

  console.log("Booking Calendly meeting:", JSON.stringify(inviteePayload, null, 2));

  const res = await fetch("https://api.calendly.com/invitees", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CALENDLY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inviteePayload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("Calendly booking error:", res.status, JSON.stringify(data));
    const errorMsg = data?.message || data?.title || "Failed to book meeting";
    const isSlotTaken = errorMsg.toLowerCase().includes("no longer available") || errorMsg.toLowerCase().includes("conflict") || res.status === 409;
    const isInvalidTime = errorMsg.toLowerCase().includes("start_time") || errorMsg.toLowerCase().includes("must be in the future");
    const isInvalidEmail = errorMsg.toLowerCase().includes("email") || errorMsg.toLowerCase().includes("invitee");

    let recovery = "Try offering a different time slot.";
    if (isSlotTaken) {
      recovery = "That time slot was just taken. Call check_availability again to get fresh slots and offer new options.";
    } else if (isInvalidTime) {
      recovery = "The time was invalid or in the past. Call check_availability to get current valid slots.";
    } else if (isInvalidEmail) {
      recovery = "The email address may be invalid. Ask the caller to confirm their email and try again.";
    }

    return NextResponse.json({
      success: false,
      error: errorMsg,
      recovery,
      scheduling_url: "https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat",
    });
  }

  // Extract useful info from the response
  const resource = data?.resource || data;
  const cancelUrl = resource?.cancel_url || "";
  const rescheduleUrl = resource?.reschedule_url || "";
  const eventUri = resource?.event || "";

  // Format the confirmed time nicely
  const confirmedTime = new Date(body.start_time).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

  return NextResponse.json({
    success: true,
    confirmed_time: confirmedTime,
    cancel_url: cancelUrl,
    reschedule_url: rescheduleUrl,
    event_uri: eventUri,
    message: `Meeting booked! ${body.name} is confirmed for ${confirmedTime} with Ariv.`,
  });
}
