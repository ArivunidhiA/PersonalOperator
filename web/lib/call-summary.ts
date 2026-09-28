/** Types and the no-LLM fallback for post-call summaries (see app/api/calls/finish). */
export type Msg = { role: "user" | "assistant"; text: string };
export type Analysis = {
  summary: string;
  intent: "recruiter" | "hiring_manager" | "engineer" | "general_inquiry" | "scheduling" | "unknown";
  topics: string[];
  outcome: "booking_link_shared" | "info_provided" | "dropped_off";
  company: string | null;
  role: string | null;
};

/** When every free model is busy: a plain summary from what the caller actually asked. */
export function fallbackAnalysis(messages: Msg[]): Analysis {
  const asked = messages
    .filter((m) => m.role === "user")
    .map((m) => m.text.replace(/\s+/g, " ").trim())
    .filter((t) => t.split(" ").length >= 3)
    .slice(0, 3);
  const cards = messages.filter((m) => m.role === "assistant" && /^\[.* shown in chat\]$/.test(m.text)).map((m) => m.text);
  const booking = cards.some((c) => /Book a chat/i.test(c));
  return {
    summary: asked.length
      ? `Caller asked: ${asked.map((a) => `"${a.slice(0, 120)}"`).join(", ")}.${booking ? " A booking link was shared." : ""}`
      : "Short call; the caller didn't ask a full question.",
    intent: booking ? "scheduling" : "unknown",
    topics: [],
    outcome: booking ? "booking_link_shared" : asked.length ? "info_provided" : "dropped_off",
    company: null,
    role: null,
  };
}

