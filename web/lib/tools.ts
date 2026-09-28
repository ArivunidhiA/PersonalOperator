import { LINKS, type LinkKey } from "./knowledge";

/**
 * Tools the voice agent can call. Provider-neutral JSON Schema; converted for
 * Gemini Live and OpenAI Realtime in lib/voice-config.ts.
 *
 * Least privilege: no tool can email anyone, read another caller's data, or
 * take free-form content from the caller and send it somewhere. Personal data
 * (names, emails) never goes through the model.
 */
export type AgentTool = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** The model must wait for the result before speaking (facts, calendar). */
  blocking: boolean;
};

const LINK_KEYS = Object.keys(LINKS) as LinkKey[];

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "retrieve_knowledge",
    description:
      "Look up a detail about Ariv that isn't already in your instructions (a project detail, a skill, dates). Pass the caller's question or topic as the query.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The question or topic, e.g. 'what did he do at Hyundai'." },
      },
      required: ["query"],
    },
    blocking: true,
  },
  {
    name: "research_role",
    description:
      "Get a short, honest read on how Ariv fits a specific role at a specific company. Call it once the caller has named both the company and the role.",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name, e.g. 'Anthropic'." },
        role: { type: "string", description: "Role title, e.g. 'Forward Deployed Engineer'." },
      },
      required: ["company", "role"],
    },
    blocking: true,
  },
  {
    name: "check_availability",
    description:
      "Check Ariv's open 15-minute slots for the next 7 days. Call when the caller wants to meet or asks when he's free.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Optional first day to check, YYYY-MM-DD. Defaults to today." },
      },
    },
    blocking: true,
  },
  {
    name: "schedule_meeting",
    description:
      "Put a booking link for the slot the caller picked in the chat. It doesn't book anything by itself: the caller confirms on the booking page. Only use a start_time returned by check_availability.",
    parameters: {
      type: "object",
      properties: {
        start_time: { type: "string", description: "Exact slot start in ISO 8601 UTC, from check_availability." },
        notes: { type: "string", description: "Optional short topic for the chat, e.g. 'FDE role at Acme'." },
      },
      required: ["start_time"],
    },
    blocking: true,
  },
  {
    name: "share_links",
    description:
      "Show clickable links in the chat (LinkedIn, GitHub, project pages, booking page). Use this whenever the caller wants links, a resume, a portfolio or contact info. Never say a URL out loud.",
    parameters: {
      type: "object",
      properties: {
        links: {
          type: "array",
          items: { type: "string", enum: LINK_KEYS },
          description: "Which links to show.",
        },
      },
      required: ["links"],
    },
    blocking: true,
  },
  {
    name: "generate_summary",
    description:
      "Show a short recap card when the caller is wrapping up. Don't read it out.",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Caller's company, or 'Unknown'." },
        role: { type: "string", description: "Role discussed, or 'General'." },
        topics: { type: "array", items: { type: "string" }, description: "2-4 short topics discussed." },
        meeting: { type: "string", description: "'Booking link shared', 'Not scheduled', etc." },
      },
      required: ["topics", "meeting"],
    },
    blocking: false,
  },
];

export const TOOL_NAMES = AGENT_TOOLS.map((t) => t.name);
