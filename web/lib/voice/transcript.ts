import type { UiCard } from "../ui-cards";

/**
 * Chronological transcript: caller lines, agent lines and tool cards in one list.
 * Pure reducer so ordering rules are unit-tested (speech-to-text for the caller
 * often lands after the agent has started answering; the caller's line must
 * still appear first).
 */
export type TextItem = { id: string; role: "user" | "assistant"; text: string; final: boolean };
export type CardItem = { id: string; role: "card"; card: UiCard };
export type TranscriptItem = TextItem | CardItem;

export type TranscriptState = {
  items: TranscriptItem[];
  openUser: string | null;
  openAgent: string | null;
  seq: number;
};

export type TranscriptAction =
  | { type: "userDelta"; text: string }
  | { type: "userFinal"; text?: string }
  | { type: "agentDelta"; text: string }
  | { type: "agentFinal"; text?: string }
  | { type: "card"; card: UiCard }
  | { type: "reset" };

/** An open agent line shorter than this was probably started after the caller finished. */
const LATE_STT_CHARS = 80;

export const initialTranscript: TranscriptState = { items: [], openUser: null, openAgent: null, seq: 0 };

function update(items: TranscriptItem[], id: string, fn: (it: TextItem) => TextItem): TranscriptItem[] {
  return items.map((it) => (it.id === id && it.role !== "card" ? fn(it) : it));
}

export function transcriptReducer(s: TranscriptState, a: TranscriptAction): TranscriptState {
  switch (a.type) {
    case "reset":
      return initialTranscript;
    case "userDelta": {
      if (!a.text) return s;
      if (s.openUser) return { ...s, items: update(s.items, s.openUser, (it) => ({ ...it, text: it.text + a.text })) };
      const id = `u${s.seq}`;
      const item: TextItem = { id, role: "user", text: a.text.trimStart(), final: false };
      const items = [...s.items];
      // Speech-to-text often lands just after the agent starts its reply: put the
      // caller's words first. But if the agent was well into its reply, the
      // caller is interrupting it (barge-in), so their words go after.
      const agentIdx = s.openAgent ? items.findIndex((x) => x.id === s.openAgent) : -1;
      const agent = agentIdx >= 0 ? items[agentIdx] : null;
      if (agent && agent.role !== "card" && agent.text.length <= LATE_STT_CHARS) items.splice(agentIdx, 0, item);
      else items.push(item);
      return { ...s, items, openUser: id, seq: s.seq + 1 };
    }
    case "userFinal": {
      if (!s.openUser) {
        if (!a.text?.trim()) return s;
        const id = `u${s.seq}`;
        return { ...s, items: [...s.items, { id, role: "user", text: a.text.trim(), final: true }], seq: s.seq + 1 };
      }
      const id = s.openUser;
      return {
        ...s,
        items: update(s.items, id, (it) => ({ ...it, text: (a.text ?? it.text).trim(), final: true })),
        openUser: null,
      };
    }
    case "agentDelta": {
      if (!a.text) return s;
      if (s.openAgent) return { ...s, items: update(s.items, s.openAgent, (it) => ({ ...it, text: it.text + a.text })) };
      const id = `a${s.seq}`;
      return {
        ...s,
        items: [...s.items, { id, role: "assistant", text: a.text.trimStart(), final: false }],
        openAgent: id,
        seq: s.seq + 1,
      };
    }
    case "agentFinal": {
      let items = s.items;
      if (s.openAgent) {
        items = update(items, s.openAgent, (it) => ({ ...it, text: (a.text ?? it.text).trim(), final: true }));
      } else if (a.text?.trim()) {
        items = [...items, { id: `a${s.seq}`, role: "assistant", text: a.text.trim(), final: true }];
      }
      if (s.openUser) items = update(items, s.openUser, (it) => ({ ...it, text: it.text.trim(), final: true }));
      // Drop empty lines (e.g. an interrupted reply that never produced text).
      items = items.filter((it) => it.role === "card" || it.text.length > 0 || !it.final);
      return { ...s, items, openAgent: null, openUser: null, seq: s.seq + (s.openAgent || !a.text ? 0 : 1) };
    }
    case "card":
      return { ...s, items: [...s.items, { id: a.card.id, role: "card", card: a.card }] };
  }
}

/** Messages to persist / summarize (cards become short assistant notes). */
export function toMessages(items: TranscriptItem[]): { role: "user" | "assistant"; text: string }[] {
  return items
    .map((it) =>
      it.role === "card"
        ? { role: "assistant" as const, text: `[${it.card.title} shown in chat]` }
        : { role: it.role, text: it.text.trim() },
    )
    .filter((m) => m.text);
}
