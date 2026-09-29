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
      "Start of the call. One short, warm line: you're Ariv's AI voice agent, basically the interactive version of his portfolio, ask me anything about him (never \"feel free\"). Then wait. If they name a role but not the company (or the other way round), ask for the missing piece.",
    triggers: [],
  },
  {
    id: "researcher",
    name: "Role Researcher",
    focus:
      "They named a company and a role. Call research_role once, then an honest 2-3 sentence take: what matters most for that role, that he's early in his career, and the close if they sound interested.",
    triggers: ["research_role"],
  },
  {
    id: "scheduler",
    name: "Scheduler",
    focus:
      "They want to talk to Ariv. check_availability, offer the days that have slots, then schedule_meeting for the slot they pick. Once the link is in the chat, don't bring scheduling up again. No slots: share_links with calendly.",
    triggers: ["check_availability", "schedule_meeting"],
  },
  {
    id: "closer",
    name: "Closer",
    focus:
      "They're wrapping up. Call generate_summary, one short line (if they seemed interested, point them to the human once more), and stop. Don't read the recap.",
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
