import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startGemini } from "@/lib/voice/gemini";
import { FakeWS, installGeminiFakes, fakePrepared, fakeHandlers, gInfo, nudges } from "./support/gemini-harness";

/** Replays the server events seen in the frozen traces (docs/qa/evidence/2026-10-31/w1-reliability). */
type Port = { onmessage: ((e: { data: unknown }) => void) | null; postMessage: () => void };
const nodes: { port: Port }[] = [];
const activity = (type: string) => ({ voiceActivity: { type } });
const words = (text: string) => ({ serverContent: { inputTranscription: { text } } });
const AUDIO = { inlineData: { data: "AAAA" } };

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
  const h = fakeHandlers();
  const s = await startGemini(gInfo, { ...fakePrepared() }, h);
  const ws = FakeWS.last;
  ws.onopen?.();
  await ws.emit({ setupComplete: {} });
  const agentSays = async (text = "Sure.") => {
    await ws.emit({ serverContent: { modelTurn: { parts: [AUDIO] }, outputTranscription: { text } } });
    await ws.emit({ serverContent: { turnComplete: true } });
  };
  const callerSays = async (text: string) => {
    await ws.emit(activity("ACTIVITY_START"));
    await ws.emit(activity("ACTIVITY_END"));
    await ws.emit(words(text));
  };
  const mic = (level: number, n = 1) => {
    for (let i = 0; i < n; i++) nodes[0].port.onmessage?.({ data: { pcm: new ArrayBuffer(2), level, rms: level } });
  };
  return { s, h, ws, agentSays, callerSays, mic };
}

beforeEach(() => {
  vi.useFakeTimers();
  installGeminiFakes();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a caller is never left in silence", () => {
  it("recovers when the server never closes the caller's turn or sends their words", async () => {
    const { s, ws, agentSays, mic } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await ws.emit(activity("ACTIVITY_START"));
    mic(0.2, 5);
    await vi.advanceTimersByTimeAsync(1600);
    mic(0, 2); // the client's silence hangover passes and it sends audioStreamEnd
    await vi.advanceTimersByTimeAsync(3600);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("holds the nudge if the caller picks back up in a turn the server still has open", async () => {
    const { s, ws, agentSays, mic } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await ws.emit(activity("ACTIVITY_START"));
    mic(0.2, 5);
    await vi.advanceTimersByTimeAsync(1600);
    mic(0, 2);
    await vi.advanceTimersByTimeAsync(1000);
    mic(0.2, 5);
    await vi.advanceTimersByTimeAsync(3000);
    expect(nudges(ws)).toHaveLength(0);
    s.stop();
  });

  it("nudges for a long turn well before the old 8 s", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("I feel like I need more information before I schedule a call with him");
    await vi.advanceTimersByTimeAsync(4000);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("answers a one-word check-in within about 2 s", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("Hello.");
    await vi.advanceTimersByTimeAsync(2100);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("treats a long turn that ends in hello as a check-in", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays(" talented. Hello. Hello.");
    await vi.advanceTimersByTimeAsync(2100);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("recovers beyond one nudge, then shows a visible line and still listens", async () => {
    const { s, h, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("Is anybody going to answer my question");
    await vi.advanceTimersByTimeAsync(9000);
    expect(nudges(ws)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(5000); // third rung: a new connection
    const sock = FakeWS.last;
    expect(sock).not.toBe(ws);
    sock.onopen?.();
    await sock.emit({ setupComplete: {} });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.mocked(h.onAgentDelta).mock.calls.flat().join(" ")).toMatch(/trouble/i);
    expect(h.onEnded).not.toHaveBeenCalled();
    s.stop();
  });

  it("a nudge that fails while the agent is playing is retried, not dropped", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("what about his projects though");
    nodes[1].port.onmessage?.({ data: { speaking: true, level: 0.1 } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(nudges(ws)).toHaveLength(0);
    nodes[1].port.onmessage?.({ data: { speaking: false, level: 0 } });
    await vi.advanceTimersByTimeAsync(600);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("recovers when the model answers with only a silent recap and no speech (F-4)", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("I don't know.");
    await ws.emit({ toolCall: { functionCalls: [{ id: "1", name: "generate_summary", args: {} }] } });
    await ws.emit({ serverContent: { generationComplete: true } });
    await ws.emit({ serverContent: { turnComplete: true } });
    await vi.advanceTimersByTimeAsync(2500);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("does not nudge after a goodbye the agent spoke before its recap", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("thanks that is all for today");
    await ws.emit({ serverContent: { modelTurn: { parts: [AUDIO] }, outputTranscription: { text: "Take care." } } });
    await ws.emit({ toolCall: { functionCalls: [{ id: "1", name: "generate_summary", args: {} }] } });
    await ws.emit({ serverContent: { turnComplete: true } });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(nudges(ws)).toHaveLength(0);
    s.stop();
  });

  it("junk output with no audio does not count as an answer", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("so what do you think");
    await ws.emit({ serverContent: { outputTranscription: { text: "​" } } });
    await ws.emit({ serverContent: { turnComplete: true } });
    await vi.advanceTimersByTimeAsync(2500);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });

  it("never nudges over a caller who is still talking", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await callerSays("I feel like you know");
    await ws.emit(activity("ACTIVITY_START")); // server split at about 14 s and the caller goes on
    await vi.advanceTimersByTimeAsync(20_000);
    expect(nudges(ws)).toHaveLength(0);
    s.stop();
  });

  it("ignores filler and an unworded activity (cough, noise)", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    await ws.emit(activity("ACTIVITY_START"));
    await ws.emit(activity("ACTIVITY_END"));
    await vi.advanceTimersByTimeAsync(10_000);
    await callerSays("Um");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(nudges(ws)).toHaveLength(0);
    s.stop();
  });

  it("does not stack a nudge on a slow tool, and waits for its result", async () => {
    const { s, ws, agentSays, callerSays } = await setup();
    await agentSays();
    await vi.advanceTimersByTimeAsync(3000);
    let finish: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => (finish = r))));
    await callerSays("when is he free this coming week");
    void ws.emit({ toolCall: { functionCalls: [{ id: "1", name: "check_availability", args: {} }] } });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(nudges(ws)).toHaveLength(0);
    finish({ ok: true, json: () => Promise.resolve({ result: "free" }) });
    await vi.advanceTimersByTimeAsync(4000);
    expect(nudges(ws)).toHaveLength(1);
    s.stop();
  });
});

describe("a long turn cannot be held open by the server (F-1)", () => {
  const streamEnds = (ws: FakeWS) => ws.sent.filter((m) => JSON.stringify(m).includes("audioStreamEnd"));

  it("sends audioStreamEnd once after 1.5 s of mic silence while activity is open, and keeps audio flowing", async () => {
    const { s, ws, mic } = await setup();
    await ws.emit(activity("ACTIVITY_START"));
    mic(0.1, 3);
    await vi.advanceTimersByTimeAsync(1000);
    mic(0.001);
    expect(streamEnds(ws)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600);
    const before = ws.sent.length;
    mic(0.001, 3);
    expect(streamEnds(ws)).toHaveLength(1);
    expect(ws.sent.length).toBe(before + 4); // three frames plus the one end signal
    s.stop();
  });

  it("sends nothing when no activity is open", async () => {
    const { s, ws, mic } = await setup();
    mic(0.1, 3);
    await vi.advanceTimersByTimeAsync(2000);
    mic(0.001, 3);
    expect(streamEnds(ws)).toHaveLength(0);
    s.stop();
  });
});
