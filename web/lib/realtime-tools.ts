export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "check_availability",
    description:
      "Check Ariv's calendar availability for the next 7 days. Call this when someone wants to schedule a meeting or asks when Ariv is free.",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description:
            "Start date to check availability from, in YYYY-MM-DD format. Defaults to today if not specified.",
        },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "schedule_meeting",
    description:
      "Generate a personalized scheduling link for the caller to book a meeting with Ariv. Call this after checking availability and confirming a time preference.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The caller's full name.",
        },
        email: {
          type: "string",
          description: "The caller's email address.",
        },
        notes: {
          type: "string",
          description:
            "Any notes about what they want to discuss with Ariv.",
        },
      },
      required: ["name", "email"],
    },
  },
  {
    type: "function",
    name: "send_confirmation_email",
    description:
      "Send a confirmation or follow-up email to the caller. Use this when they want a confirmation email after scheduling, or when they want Ariv's info sent to them.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address.",
        },
        subject: {
          type: "string",
          description: "Email subject line.",
        },
        body: {
          type: "string",
          description:
            "Email body content in plain text. Include relevant details like scheduling link, Ariv's background summary, or meeting confirmation.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
];
