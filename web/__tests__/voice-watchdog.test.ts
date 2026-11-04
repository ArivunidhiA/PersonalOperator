import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startGemini } from "@/lib/voice/gemini";
import { FakeWS, installGeminiFakes, fakePrepared, fakeHandlers, gInfo, nudges } from "./support/gemini-harness";

type Port = { onmessage: ((e: { data: unknown }) => void) | null; postMessage: () => void };
const nodes: { port: Port }[] = [];

async function setup() {
  nodes.length = 0;
  class N {
    port: Port = { onmessage: null, postMessage: vi.fn() };
    connect = vi.fn();
    disconnect = vi.fn();
    constructor() {
      nodes.push(this);
    }
  }
  vi.stubGlobal("AudioWorkletNode", N);
  const s = await startGemini(gInfo, { ...fakePrepared() }, fakeHandlers());
  const ws = FakeWS.last;
  ws.onopen?.();
  await ws.emit({ setupComplete: {} });
  const capture = nodes[0];
  const voice = (level = 0.1) => capture.port.onmessage?.({ data: { pcm: new ArrayBuffer(2), level } });
  const modelAnswers = async () => {
    await ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] }, outputTranscription: { text: "Sure." } } });
    await ws.emit({ serverContent: { turnComplete: true } });
  };
  const transcript = (text: string) => ws.emit({ serverContent: { inputTranscription: { text } } });
  return { s, ws, voice, modelAnswers, transcript };
}

beforeEach(() => {
  vi.useFakeTimers();
  installGeminiFakes();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("stall watchdog", () => {
  it("does NOT nudge for late transcription of a turn the model already answered", async () => {
    const { s, ws, modelAnswers, transcript } = await setup();
    await modelAnswers();
    await vi.advanceTimersByTimeAsync(4000); // beyond the 2.5 s quick-late window; caller silent
    await transcript("what projects are you building");
    await vi.advanceTimersByTimeAsync(12000);
    expect(nudges(ws)).toHaveLength(0);
    s.stop();
  });

  it("nudges when the caller really spoke after the answer and the model stays silent", async () => {
    const { s, ws, voice, modelAnswers, transcript } = await setup();
    await modelAnswers();
    await vi.advanceTimersByTimeAsync(1000);
    voice();
    await vi.advanceTimersByTimeAsync(3000);
    await transcript("what projects are you building");
    await vi.advanceTimersByTimeAsync(4000);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("ignores mic level that only happens while the agent is still speaking", async () => {
    const { s, ws, modelAnswers, transcript } = await setup();
    await modelAnswers();
    // agent playback still going (player reports speaking), leaked echo on the mic
    nodes[1].port.onmessage?.({ data: { speaking: true, level: 0.2 } });
    await vi.advanceTimersByTimeAsync(500);
    nodes[0].port.onmessage?.({ data: { pcm: new ArrayBuffer(2), level: 0.1 } });
    nodes[1].port.onmessage?.({ data: { speaking: false, level: 0 } });
    await vi.advanceTimersByTimeAsync(4000);
    await transcript("what projects are you building");
    await vi.advanceTimersByTimeAsync(12000);
    expect(nudges(ws)).toHaveLength(0);
    s.stop();
  });
});
