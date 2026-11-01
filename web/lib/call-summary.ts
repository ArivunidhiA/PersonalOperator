/** Types, the no-LLM fallback and the name scrub for post-call summaries (see app/api/calls/finish). */
import { FACTS, LINK_LABELS } from "@/lib/knowledge";

export type Msg = { role: "user" | "assistant"; text: string };
export type Analysis = {
  summary: string;
  intent: "recruiter" | "hiring_manager" | "engineer" | "general_inquiry" | "scheduling" | "unknown";
  topics: string[];
  outcome: "booking_link_shared" | "info_provided" | "dropped_off";
  company: string | null;
  /** The role they're hiring for or asking about. */
  role: string | null;
  /** Only what the caller clearly said about themselves; never guessed. */
  caller_name?: string | null;
  caller_role?: string | null;
};

/** When every free model is busy: a plain count. Never quotes the caller, who may have named a company. */
export function fallbackAnalysis(messages: Msg[]): Analysis {
  const asked = messages.filter((m) => m.role === "user" && m.text.trim().split(/\s+/).length >= 3);
  const cards = messages.filter((m) => m.role === "assistant" && /^\[.* shown in chat\]$/.test(m.text)).map((m) => m.text);
  const booking = cards.some((c) => /Book a chat/i.test(c));
  return {
    summary: asked.length
      ? `Caller asked ${asked.length === 1 ? "a question" : `${asked.length} questions`}.${booking ? " A booking link was shared." : ""}`
      : "Short call; the caller didn't ask a full question.",
    intent: booking ? "scheduling" : "unknown",
    topics: [],
    outcome: booking ? "booking_link_shared" : asked.length ? "info_provided" : "dropped_off",
    company: null,
    role: null,
    caller_name: null,
    caller_role: null,
  };
}


const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

// Words his own notes use, so his history and skills survive. Confidential names are never in there.
const KNOWN = new Set(words(JSON.stringify([FACTS, LINK_LABELS])));
const PLAIN = new Set(
  "i a an the this that these those they he she it we you their his her caller callers asked asking wanted wants did do does is was were who what when where why how which and but or so if then also after before short call visitor recruiter hi hello hey thanks am pm monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december".split(" "),
);
// Common tools and cities his notes skip. Missing one only turns it into "a company" in a summary.
for (const w of "langgraph langchain llamaindex pytorch tensorflow react java javascript golang c++ sql postgres mongodb redis kafka terraform azure gcp django vue flutter gemini live api chicago seattle boston austin london".split(" ")) PLAIN.add(w);
const NAME_RUN = /\p{Lu}[\p{L}\p{N}&-]*(?: \p{Lu}[\p{L}\p{N}&-]*)*/gu;
const OPENS_SENTENCE = /(?:^|[.!?:]\s+|["“])$/;

/**
 * The caller sees the summary, so a company they said stays out of it. This goes
 * by shape, not by a list of names: a list would confirm a guess, the way the
 * share route did. A capitalized word his notes don't use is treated as a name.
 * A sentence's first word is capitalized anyway, so it only counts if the caller said it.
 */
export function scrubNames(text: string, messages: Msg[], companies: (string | null)[] = [], keep: (string | null)[] = []) {
  const said = new Set(messages.filter((m) => m.role === "user").flatMap((m) => words(m.text)));
  const kept = new Set(keep.flatMap((k) => words(k ?? "")));
  const ok = (w: string) => KNOWN.has(w) || PLAIN.has(w) || kept.has(w);

  let out = text.replace(NAME_RUN, (run, at: number) => {
    const parts = run.split(" ");
    let i = 0;
    while (i < parts.length - 1 && PLAIN.has(parts[i].toLowerCase())) i++;
    const lead = parts.slice(0, i);
    const rest = parts.slice(i).flatMap(words);
    const opens = i === 0 && OPENS_SENTENCE.test(text.slice(0, at));
    const name = rest.some((w) => !ok(w)) && (!opens || parts.length > 1 || rest.some((w) => said.has(w) && !ok(w)));
    if (!name) return run;
    const before = lead.filter((w) => !/^(?:a|an|the)$/i.test(w));
    const first = OPENS_SENTENCE.test(text.slice(0, at)) && !before.length;
    return [...before, first ? "A company" : "a company"].join(" ");
  });
  for (const c of companies) {
    if (c?.trim() && !words(c).every(ok)) out = out.replace(new RegExp(`\\b${c.trim().replace(ESCAPE, "\\$&")}\\b`, "gi"), "a company");
  }
  return out;
}
