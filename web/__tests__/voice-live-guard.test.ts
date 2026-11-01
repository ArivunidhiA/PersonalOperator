import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startGemini } from "@/lib/voice/gemini";
import { FakeWS, installGeminiFakes, fakePrepared, fakeHandlers, gInfo } from "./support/gemini-harness";

type Port = { onmessage: ((e: unknown) => void) | null; postMessage: ReturnType<typeof vi.fn> };
const nodes: { port: Port }[] = [];
const AUDIO = { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } };
const CORRECTION = "(Correction";
const GOOD = "He builds voice agents. ";
const BAD = "I'm a real human. ";

const player = () => nodes[1].port.postMessage;
const flushes = () => player().mock.calls.filter(([m]) => m === "flush").length;
const played = () => player().mock.calls.filter(([m]) => typeof m === "object").length;
const corrections = (ws: FakeWS) => ws.sent.filter((m) => JSON.stringify(m).includes(CORRECTION));
const out = (ws: FakeWS, text: string) => ws.emit({ serverContent: { outputTranscription: { text } } });

async function start() {
  const h = fakeHandlers();
  const s = await startGemini(gInfo, { ...fakePrepared() }, h);
  const ws = FakeWS.last;
  ws.onopen?.();
  await ws.emit({ setupComplete: {} });
  await ws.emit({ serverContent: AUDIO });
  await ws.emit({ serverContent: { turnComplete: true } });
  player().mockClear();
  return { s, h, ws };
}

describe("live guard in the call", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nodes.length = 0;
    installGeminiFakes();
    vi.stubGlobal(
      "AudioWorkletNode",
      class {
        port: Port = { onmessage: null, postMessage: vi.fn() };
        connect = vi.fn();
        disconnect = vi.fn();
        constructor() {
          nodes.push(this);
        }
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leaves a clean reply alone", async () => {
    const { h, ws } = await start();
    await ws.emit({ serverContent: AUDIO });
    await out(ws, GOOD);
    await out(ws, "He's not a software engineer at INZI, he's a coordinator.");
    await ws.emit({ serverContent: { generationComplete: true } });
    await ws.emit({ serverContent: { turnComplete: true } });
    expect(flushes()).toBe(0);
    expect(corrections(ws)).toHaveLength(0);
    expect(h.onAgentDelta).toHaveBeenCalledWith(GOOD);
  });

  it("cuts the audio, hides the line and asks for a correction on a hit", async () => {
    const { h, ws } = await start();
    await out(ws, GOOD);
    await out(ws, BAD);
    expect(flushes()).toBe(1);
    expect(corrections(ws)).toHaveLength(1);
    expect(corrections(ws)[0]).toMatchObject({ clientContent: { turnComplete: true } });
    expect(h.onAgentDelta).not.toHaveBeenCalledWith(BAD);
  });

  it("drops the rest of the cut turn, then plays the corrected reply", async () => {
    const { h, ws } = await start();
    await out(ws, BAD);
    await ws.emit({ serverContent: AUDIO });
    await out(ws, "Rest of the bad reply. ");
    expect(played()).toBe(0);
    expect(h.onAgentDelta).not.toHaveBeenCalledWith("Rest of the bad reply. ");
    await ws.emit({ serverContent: { interrupted: true } });
    await ws.emit({ serverContent: AUDIO });
    await out(ws, "Sorry, I'm Ariv's AI agent. ");
    expect(played()).toBe(1);
    expect(h.onAgentDelta).toHaveBeenCalledWith("Sorry, I'm Ariv's AI agent. ");
  });

  it("never leaves the call muted if the cut turn doesn't end", async () => {
    const { ws } = await start();
    await out(ws, BAD);
    await vi.advanceTimersByTimeAsync(3000);
    await ws.emit({ serverContent: AUDIO });
    expect(played()).toBe(1);
  });

  it("catches a last sentence with no trailing space at generationComplete", async () => {
    const { ws } = await start();
    await out(ws, "I'm a real human.");
    expect(flushes()).toBe(0);
    await ws.emit({ serverContent: { generationComplete: true } });
    expect(flushes()).toBe(1);
    expect(corrections(ws)).toHaveLength(1);
  });

  it("does not send a second correction after turnComplete", async () => {
    const { ws } = await start();
    await out(ws, "I'm a real human.");
    await ws.emit({ serverContent: { generationComplete: true } });
    await ws.emit({ serverContent: { turnComplete: true } });
    expect(corrections(ws)).toHaveLength(1);
  });

  it("shows every word of a clean reply once the turn ends", async () => {
    const { h, ws } = await start();
    await out(ws, "He builds");
    await out(ws, " voice agents.");
    await ws.emit({ serverContent: { generationComplete: true } });
    expect(vi.mocked(h.onAgentDelta).mock.calls.map(([t]) => t).join("")).toBe("He builds voice agents.");
  });

  it("sends one correction per caller turn, so it can't loop with the model", async () => {
    const { ws } = await start();
    await out(ws, BAD);
    await ws.emit({ serverContent: { interrupted: true } });
    await out(ws, BAD);
    expect(flushes()).toBe(3); // two cuts plus the interrupted event
    expect(corrections(ws)).toHaveLength(1);
    await ws.emit({ serverContent: { turnComplete: true } });
    await ws.emit({ voiceActivity: { type: "ACTIVITY_START" } });
    await out(ws, BAD);
    expect(corrections(ws)).toHaveLength(2);
  });

  it("still leaves the caller with a recovery if the correction gets no reply", async () => {
    const { ws } = await start();
    await out(ws, BAD);
    await ws.emit({ serverContent: { interrupted: true } });
    const before = ws.sent.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(ws.sent.length).toBeGreaterThan(before);
  });

  it("does not carry a half-checked reply across a reconnect", async () => {
    const { ws } = await start();
    await out(ws, "I'm a real ");
    ws.readyState = 3;
    ws.onclose?.({ code: 1011, reason: "Internal error" });
    await vi.advanceTimersByTimeAsync(2000);
    const next = FakeWS.last;
    next.onopen?.();
    await next.emit({ setupComplete: {} });
    await out(next, "human resources. ");
    expect(flushes()).toBe(0);
  });
});
