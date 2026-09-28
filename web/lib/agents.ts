import { TOOL_NAMES } from "./tools";

/**
 * The call has four modes: greeter, researcher, scheduler, closer.
 *
 * They used to be separate personas swapped mid-call with session.update. That
 * dropped the honesty rules, the facts and the scheduling tools after a swap,
 * and Gemini Live can't change instructions mid-session anyway. Now every mode
 * lives in the one prompt (so rules and tools never disappear), and the UI
 * derives the active mode from tool calls to show what the agent is doing.
 */
export interface AgentMode {
  id: "greeter" | "researcher" | "scheduler" | "closer";
  name: string;
  /** Guidance for this part of the call, rendered into the prompt. */
  focus: string;
  /** Tool calls that move the call into this mode. */
  triggers: string[];
}

export const AGENT_MODES: AgentMode[] = [
  {
    id: "greeter",
    name: "Greeter",
    focus:
      "Start of the call. Greet in one short, casual line, like a friend picking up the phone, then wait. The page already tells people you're an AI, so don't open with it. Answer whatever they ask from FACTS. If they name a role but not the company (or the other way round), it's fine to ask for the missing piece.",
    triggers: [],
  },
  {
    id: "researcher",
    name: "Role Researcher",
    focus:
      "They named a company and a role. Call research_role once, then give a 2-3 sentence honest take: lead with what matters most for that role, be clear he's early in his career, and offer to go deeper on one project. No structured breakdowns.",
    triggers: ["research_role"],
  },
  {
    id: "scheduler",
    name: "Scheduler",
    focus:
      "They want to talk to Ariv. check_availability, offer every day that has slots, then schedule_meeting for the slot they pick. After the link is in the chat, don't bring scheduling up again. If there are no slots, share the booking link with share_links.",
    triggers: ["check_availability", "schedule_meeting"],
  },
  {
    id: "closer",
    name: "Closer",
    focus:
      "They're wrapping up. Call generate_summary, say one short friendly line, and stop. Don't read the recap.",
    triggers: ["generate_summary"],
  },
];

export function renderModes(): string {
  return AGENT_MODES.map((m) => `- ${m.name}: ${m.focus}`).join("\n");
}

/** Which mode a tool call moves the call into (null = stay). */
export function detectAgentTransition(currentId: string, toolName: string): AgentMode | null {
  const current = AGENT_MODES.find((a) => a.id === currentId);
  if (current?.triggers.includes(toolName)) return null;
  return AGENT_MODES.find((a) => a.id !== currentId && a.triggers.includes(toolName)) ?? null;
}

// Guard against a mode pointing at a tool that no longer exists.
for (const m of AGENT_MODES) {
  for (const t of m.triggers) {
    if (!TOOL_NAMES.includes(t)) throw new Error(`Mode ${m.id} triggers unknown tool ${t}`);
  }
}
