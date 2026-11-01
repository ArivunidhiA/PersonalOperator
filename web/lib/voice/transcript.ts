import type { UiCard } from "../ui-cards";

/**
 * Chronological transcript: caller lines, agent lines and tool cards in one list.
 * Pure reducer so ordering rules are unit-tested (speech-to-text for the caller
 * often lands after the agent has started answering; the caller's line must
 * still appear first).
 */
export type TextItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
  /** Text is a live caption, still replaceable by Gemini's transcript. */
  caption?: boolean;
  /** Leading characters of a caption that have settled; the rest may still change. */
  settled?: number;
  /** The caption Gemini's text replaced, restored if Gemini lost most of the turn. */
  heardAs?: string;
};
export type CardItem = { id: string; role: "card"; card: UiCard };
export type TranscriptItem = TextItem | CardItem;

export type TranscriptState = {
  items: TranscriptItem[];
  openUser: string | null;
  openAgent: string | null;
  seq: number;
  /** Line taking caption partials, and the caption utterance it last took. */
  captionLine: string | null;
  captionUtterance: number;
  /** Caption text from earlier utterances of this line, plus a separator. */
  captionBase: string;
  /** The agent started after this line opened: a new utterance goes on a new line. */
  captionClosed: boolean;
  /** Utterances up to this one were answered by Gemini's text; late partials for them are ignored. */
  captionDone: number;
  /** Caption lines Gemini hasn't transcribed yet, oldest first. */
  waiting: string[];
};

export type TranscriptAction =
  | { type: "userDelta"; text: string }
  | { type: "userPartial"; utterance: number; text: string; settled?: number }
  | { type: "userPartialCancel" }
  | { type: "userFinal"; text?: string }
  | { type: "agentDelta"; text: string }
  | { type: "agentFinal"; text?: string }
  | { type: "card"; card: UiCard }
  | { type: "reset" };

/** An open agent line shorter than this was probably started after the caller finished. */
const LATE_STT_CHARS = 80;

/** Gemini's text wins unless it has under this share of the caption's words (it lost the turn's start). */
const LOST_TURN_RATIO = 0.8;

export const initialTranscript: TranscriptState = {
  items: [],
  openUser: null,
  openAgent: null,
  seq: 0,
  captionLine: null,
  captionUtterance: 0,
  captionBase: "",
  captionClosed: false,
  captionDone: 0,
  waiting: [],
};

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

function update(items: TranscriptItem[], id: string, fn: (it: TextItem) => TextItem): TranscriptItem[] {
  return items.map((it) => (it.id === id && it.role !== "card" ? fn(it) : it));
}

/** Close a caller line. Final text rule: Gemini's, unless it lost most of what the caption heard. */
function closeUser(it: TextItem): TextItem {
  const lost = it.heardAs && wordCount(it.text) < LOST_TURN_RATIO * wordCount(it.heardAs);
  return { ...it, text: (lost ? it.heardAs! : it.text).trim(), final: true, heardAs: undefined };
}

/** Add a new caller line: before an agent reply that has barely started, otherwise at the end. */
function insertUser(s: TranscriptState, item: TextItem): TranscriptItem[] {
  const items = [...s.items];
  // Speech-to-text often lands just after the agent starts its reply: put the
  // caller's words first. But if the agent was well into its reply, the
  // caller is interrupting it (barge-in), so their words go after.
  const agentIdx = s.openAgent ? items.findIndex((x) => x.id === s.openAgent) : -1;
  const agent = agentIdx >= 0 ? items[agentIdx] : null;
  if (agent && agent.role !== "card" && agent.text.length <= LATE_STT_CHARS) items.splice(agentIdx, 0, item);
  else items.push(item);
  return items;
}

/** Gemini's text landing on the oldest caption line: it takes over from the caption. */
function fillCaption(s: TranscriptState, id: string, text: string): TranscriptState {
  return {
    ...s,
    items: update(s.items, id, (it) => ({ ...it, text: text.trimStart(), caption: false, settled: undefined, heardAs: it.text })),
    waiting: s.waiting.filter((w) => w !== id),
    openUser: id,
    captionLine: s.captionLine === id ? null : s.captionLine,
    captionDone: s.captionLine === id ? s.captionUtterance : s.captionDone,
  };
}

export function transcriptReducer(s: TranscriptState, a: TranscriptAction): TranscriptState {
  switch (a.type) {
    case "reset":
      return initialTranscript;
    case "userDelta": {
      if (!a.text) return s;
      if (s.waiting[0]) return fillCaption(s, s.waiting[0], a.text);
      if (s.openUser) return { ...s, items: update(s.items, s.openUser, (it) => ({ ...it, text: it.text + a.text })) };
      const id = `u${s.seq}`;
      const items = insertUser(s, { id, role: "user", text: a.text.trimStart(), final: false });
      return { ...s, items, openUser: id, seq: s.seq + 1 };
    }
    case "userPartial": {
      if (!a.text.trim() || a.utterance <= s.captionDone) return s;
      const settled = a.settled ?? 0;
      if (s.captionLine && (a.utterance === s.captionUtterance || !s.captionClosed)) {
        const line = s.items.find((it) => it.id === s.captionLine) as TextItem;
        const base = a.utterance === s.captionUtterance ? s.captionBase : `${line.text} `;
        return {
          ...s,
          items: update(s.items, s.captionLine, (it) => ({ ...it, text: base + a.text, settled: base.length + settled })),
          captionUtterance: a.utterance,
          captionBase: base,
        };
      }
      const id = `u${s.seq}`;
      const open = s.openUser ? (s.items.find((it) => it.id === s.openUser) as TextItem | undefined) : undefined;
      const answered = open && !s.waiting.includes(open.id);
      const closed = answered ? update(s.items, open.id, closeUser) : s.items;
      const items = insertUser({ ...s, items: closed }, { id, role: "user", text: a.text, final: false, caption: true, settled });
      // Caption lines from a turn that already ended are done waiting for Gemini: keep their text.
      const live = s.waiting.filter((w) => items.some((it) => it.id === w && it.role !== "card" && !it.final));
      return {
        ...s,
        items,
        seq: s.seq + 1,
        openUser: open && !answered ? open.id : id,
        waiting: [...live, id],
        captionLine: id,
        captionUtterance: a.utterance,
        captionBase: "",
        captionClosed: false,
      };
    }
    case "userPartialCancel": {
      const id = s.captionLine;
      if (!id) return s;
      return {
        ...s,
        items: s.items.filter((it) => it.id !== id),
        waiting: s.waiting.filter((w) => w !== id),
        openUser: s.openUser === id ? null : s.openUser,
        captionLine: null,
        captionDone: s.captionUtterance,
      };
    }
    case "userFinal": {
      if (a.text?.trim() && s.waiting[0]) {
        const filled = fillCaption(s, s.waiting[0], a.text);
        return { ...filled, items: update(filled.items, s.waiting[0], closeUser), openUser: null };
      }
      if (!s.openUser) {
        if (!a.text?.trim()) return s;
        const id = `u${s.seq}`;
        return { ...s, items: [...s.items, { id, role: "user", text: a.text.trim(), final: true }], seq: s.seq + 1 };
      }
      const id = s.openUser;
      return {
        ...s,
        items: update(s.items, id, (it) => closeUser({ ...it, text: a.text ?? it.text })),
        openUser: null,
      };
    }
    case "agentDelta": {
      if (!a.text) return s;
      if (s.openAgent) return { ...s, items: update(s.items, s.openAgent, (it) => ({ ...it, text: it.text + a.text })), captionClosed: true };
      const id = `a${s.seq}`;
      return {
        ...s,
        items: [...s.items, { id, role: "assistant", text: a.text.trimStart(), final: false }],
        openAgent: id,
        seq: s.seq + 1,
        captionClosed: true,
      };
    }
    case "agentFinal": {
      let items = s.items;
      if (s.openAgent) {
        items = update(items, s.openAgent, (it) => ({ ...it, text: (a.text ?? it.text).trim(), final: true }));
      } else if (a.text?.trim()) {
        items = [...items, { id: `a${s.seq}`, role: "assistant", text: a.text.trim(), final: true }];
      }
      if (s.openUser) items = update(items, s.openUser, closeUser);
      for (const id of s.waiting) items = update(items, id, closeUser);
      // Drop empty lines (e.g. an interrupted reply that never produced text).
      items = items.filter((it) => it.role === "card" || it.text.length > 0 || !it.final);
      return { ...s, items, openAgent: null, openUser: null, captionClosed: true, seq: s.seq + (s.openAgent || !a.text ? 0 : 1) };
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
