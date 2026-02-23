import { NextResponse } from "next/server";
import { Resend } from "resend";

const resendKey = process.env.RESEND_API_KEY;

export async function POST(req: Request) {
  if (!resendKey) {
    return NextResponse.json(
      { error: "Resend not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.to || !body?.subject) {
    return NextResponse.json(
      { error: "Missing to or subject" },
      { status: 400 }
    );
  }

  const resend = new Resend(resendKey);

  const { data, error } = await resend.emails.send({
    from: "Ariv's AI <ai@arivsai.app>",
    to: body.to,
    subject: body.subject,
    html: body.html || body.text || "",
  });

  if (error) {
    console.error("Resend error:", JSON.stringify(error));
    return NextResponse.json(
      { error: error.message || "Failed to send email", success: false },
      { status: 500 }
    );
  }

  console.log("Email sent:", data);
  return NextResponse.json({ success: true });
}
