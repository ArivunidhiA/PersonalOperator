import { NextResponse } from "next/server";

const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;

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

  const schedulingRes = await fetch(
    "https://api.calendly.com/scheduled_events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CALENDLY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        max_event_count: 1,
        invitee_email: body.email,
      }),
    }
  );

  // Calendly doesn't have a direct "create booking" API for personal access tokens.
  // The best approach is to generate a scheduling link with prefilled info.
  const schedulingUrl = `https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat?name=${encodeURIComponent(body.name)}&email=${encodeURIComponent(body.email)}&a1=${encodeURIComponent(body.notes || "")}`;

  // We can't directly create a booking via Calendly API with a PAT,
  // so we return the prefilled scheduling link.
  void schedulingRes.text().catch(() => null);

  return NextResponse.json({
    success: true,
    scheduling_url: schedulingUrl,
    message: `Scheduling link generated for ${body.name}. They can pick a time at: ${schedulingUrl}`,
  });
}
