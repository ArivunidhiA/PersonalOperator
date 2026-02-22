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
      "Actually book a meeting with Ariv on his calendar. This creates a real calendar event. Call this after checking availability and confirming the time with the caller. You must provide the exact start_time from the available slots.",
    parameters: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          description:
            "The exact start time in ISO 8601 UTC format from the available slots, e.g. '2026-02-25T15:00:00Z'. Must be one of the slots returned by check_availability.",
        },
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
      required: ["start_time", "name", "email"],
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
  {
    type: "function",
    name: "retrieve_knowledge",
    description:
      "Search Ariv's knowledge base for specific information. Use this when someone asks a detailed question about Ariv's work, projects, skills, or experience that you want to answer accurately. Pass the question or topic as the query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The question or topic to search for, e.g. 'What did Ariv do at Hyundai?' or 'Python experience' or 'payment processing projects'.",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "lookup_caller",
    description:
      "Look up a caller by their email to see if they've called before. Use this when a caller gives their email or name, to check if there's history from a previous conversation. This helps personalize the interaction.",
    parameters: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The caller's email address.",
        },
      },
      required: ["email"],
    },
  },
  {
    type: "function",
    name: "research_role",
    description:
      "Research a specific company and role to understand what they need, what the company does, and which of Ariv's experiences are most relevant. Call this IMMEDIATELY when a caller mentions a company name, role title, or job they're hiring for. This helps you tailor your pitch to what actually matters for that role.",
    parameters: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description:
            "The company name, e.g. 'Strada', 'Palantir', 'Google'.",
        },
        role: {
          type: "string",
          description:
            "The role title, e.g. 'Forward Deployment Engineer', 'Software Engineer', 'Data Analyst'.",
        },
      },
      required: ["company", "role"],
    },
  },
];
