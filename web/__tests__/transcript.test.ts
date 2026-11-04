import { describe, it, expect } from "vitest";
import { initialTranscript, toMessages, transcriptReducer, type TextItem, type TranscriptAction } from "@/lib/voice/transcript";

const run = (actions: TranscriptAction[]) => actions.reduce(transcriptReducer, initialTranscript);
const texts = (s: ReturnType<typeof run>) => s.items.map((i) => (i.role === "card" ? `card:${i.card.kind}` : `${i.role}:${i.text}`));

describe("transcript ordering", () => {
  it("builds one chronological list", () => {
    const s = run([
      { type: "agentDelta", text: "Hey! I'm Ariv's AI." },
      { type: "agentFinal" },
      { type: "userDelta", text: "Where does he " },
      { type: "userDelta", text: "work?" },
      { type: "userFinal" },
      { type: "agentDelta", text: "INZI Controls." },
      { type: "agentFinal" },
    ]);
    expect(texts(s)).toEqual(["assistant:Hey! I'm Ariv's AI.", "user:Where does he work?", "assistant:INZI Controls."]);
    expect(s.items.every((i) => i.role === "card" || i.final)).toBe(true);
  });

  it("puts a late caller transcript before the reply it triggered", () => {
    const s = run([
      { type: "agentDelta", text: "So he" },
      { type: "userDelta", text: "What does he do?" },
      { type: "agentDelta", text: " coordinates projects." },
      { type: "agentFinal" },
    ]);
    expect(texts(s)).toEqual(["user:What does he do?", "assistant:So he coordinates projects."]);
  });

  it("keeps cards in order and drops empty interrupted replies", () => {
    const s = run([
      { type: "userFinal", text: "Links please" },
      { type: "card", card: { id: "c1", kind: "links", title: "Links", links: [{ label: "GitHub", url: "https://github.com/x" }] } },
      { type: "agentFinal" },
      { type: "agentDelta", text: "Dropped them in the chat." },
      { type: "agentFinal" },
    ]);
    expect(texts(s)).toEqual(["user:Links please", "card:links", "assistant:Dropped them in the chat."]);
  });

  it("serializes cards as short notes for the saved transcript", () => {
    const s = run([{ type: "card", card: { id: "c", kind: "recap", title: "Recap", lines: ["a"] } }]);
    expect(toMessages(s.items)).toEqual([{ role: "assistant", text: "[Recap shown in chat]" }]);
  });

  it("reset clears everything", () => {
    expect(run([{ type: "agentDelta", text: "x" }, { type: "reset" }])).toEqual(initialTranscript);
  });
});

describe("barge-in ordering", () => {
  it("puts an interruption after an agent line that was well underway", () => {
    const s = run([
      { type: "agentDelta", text: "So at INZI he runs the weekly follow-up loop on projects, chasing open issues across engineering, quality and" },
      { type: "userDelta", text: "Wait, what about his open source?" },
      { type: "agentFinal" },
    ]);
    expect(texts(s)).toEqual([
      "assistant:So at INZI he runs the weekly follow-up loop on projects, chasing open issues across engineering, quality and",
      "user:Wait, what about his open source?",
    ]);
  });
});

describe("live caption partials", () => {
  const partial = (text: string, utterance = 1, settled = 0): TranscriptAction => ({ type: "userPartial", utterance, text, settled });
  const line = (s: ReturnType<typeof run>, i = 0) => s.items[i] as TextItem;

  it("replaces partial text in place instead of appending", () => {
    const s = run([partial("where"), partial("where does"), partial("where does he work")]);
    expect(texts(s)).toEqual(["user:where does he work"]);
    expect(line(s).caption).toBe(true);
  });

  it("marks how much of the partial has settled", () => {
    const s = run([partial("where does he", 1, 5)]);
    expect(line(s).settled).toBe(5);
  });

  it("final Gemini text replaces the caption on the same line", () => {
    const s = run([partial("where does Eric work"), { type: "userDelta", text: "Where does Ariv work?" }, { type: "userFinal" }]);
    expect(texts(s)).toEqual(["user:Where does Ariv work?"]);
    expect(line(s).caption).toBeFalsy();
    expect(line(s).final).toBe(true);
  });

  it("keeps the caption when Gemini lost most of the turn", () => {
    const s = run([partial("is Registrum one of his open source projects"), { type: "userDelta", text: "source projects?" }, { type: "agentDelta", text: "Yes." }, { type: "agentFinal" }]);
    expect(texts(s)[0]).toBe("user:is Registrum one of his open source projects");
  });

  it("keeps the caller first when the reply starts before Gemini's text", () => {
    const s = run([partial("what does he do"), { type: "agentDelta", text: "So he" }, { type: "userDelta", text: "What does he do?" }, { type: "agentFinal" }]);
    expect(texts(s)).toEqual(["user:What does he do?", "assistant:So he"]);
  });

  it("Gemini text arriving after the reply ended still lands on the caption line", () => {
    const s = run([partial("what does he do"), { type: "agentDelta", text: "He builds." }, { type: "agentFinal" }, { type: "userDelta", text: "What does he do?" }, { type: "userFinal" }]);
    expect(texts(s)).toEqual(["user:What does he do?", "assistant:He builds."]);
  });

  it("joins several caption utterances in one caller turn", () => {
    const s = run([partial("hello", 1), partial("hello there", 1), partial("are you", 2), partial("are you there", 2)]);
    expect(texts(s)).toEqual(["user:hello there are you there"]);
  });

  it("a partial after the agent got well underway is a new line after it (barge-in)", () => {
    const long = "So at INZI he runs the weekly follow-up loop on projects, chasing open issues across engineering, quality and";
    const s = run([{ type: "agentDelta", text: long }, partial("wait what about")]);
    expect(texts(s)).toEqual([`assistant:${long}`, "user:wait what about"]);
  });

  it("the next caller turn opens a new line and old caption text stays", () => {
    const s = run([
      partial("first question", 1),
      { type: "agentDelta", text: "Answer." },
      { type: "agentFinal" },
      partial("second question", 2),
      { type: "userDelta", text: "Second question?" },
    ]);
    expect(texts(s)).toEqual(["user:first question", "assistant:Answer.", "user:Second question?"]);
  });

  it("a caller who resumes after Gemini's text gets a new line", () => {
    const s = run([partial("one", 1), { type: "userDelta", text: "One." }, partial("two", 2), { type: "userDelta", text: "Two." }]);
    expect(texts(s)).toEqual(["user:One.", "user:Two."]);
  });

  it("captions off: the Gemini-only path is unchanged", () => {
    const s = run([{ type: "userDelta", text: "Where does " }, { type: "userDelta", text: "he work?" }, { type: "userFinal" }]);
    expect(texts(s)).toEqual(["user:Where does he work?"]);
  });

  it("a caption-only line is saved, and an empty partial changes nothing", () => {
    const s = run([partial(""), partial("are you there"), { type: "agentFinal" }]);
    expect(toMessages(s.items)).toEqual([{ role: "user", text: "are you there" }]);
  });

  it("a withdrawn caption line disappears from the transcript", () => {
    const s = run([partial("echo of the agent"), { type: "userPartialCancel" }]);
    expect(s.items).toEqual([]);
  });
});
