import { describe, it, expect } from "vitest";
import { initialTranscript, toMessages, transcriptReducer, type TranscriptAction } from "@/lib/voice/transcript";

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
