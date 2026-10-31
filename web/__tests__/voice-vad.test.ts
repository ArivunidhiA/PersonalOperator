import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVadGate } from "@/lib/voice/vad-gate";
import { startGemini } from "@/lib/voice/gemini";
import { FakeWS, installGeminiFakes, fakePrepared, fakeHandlers, gInfo } from "./support/gemini-harness";

describe("vad gate", () => {
  it("sends the onset frame immediately, with pre-roll in front", () => {
    const g = createVadGate<string>({ preRollFrames: 3 });
    for (let i = 0; i < 10; i++) expect(g.push(0.002, `q${i}`, i * 32)).toEqual({ send: [], streamEnd: false });
    const r = g.push(0.2, "speech", 320);
    expect(r.send).toEqual(["q7", "q8", "q9", "speech"]);
  });

  it("keeps sending for 300 ms hangover, then reports streamEnd once and stops", () => {
    const g = createVadGate<string>();
    g.push(0.2, "s", 0);
    expect(g.push(0.002, "a", 100).send).toEqual(["a"]);
    expect(g.push(0.002, "b", 300).send).toEqual(["b"]);
    expect(g.push(0.002, "c", 332)).toEqual({ send: [], streamEnd: true });
    expect(g.push(0.002, "d", 364)).toEqual({ send: [], streamEnd: false });
  });

  it("never reports streamEnd before any speech", () => {
    const g = createVadGate<string>();
    expect(g.push(0.001, "x", 5000).streamEnd).toBe(false);
  });
});

describe("gemini with NEXT_PUBLIC_CLIENT_VAD", () => {
  const ports: { onmessage: ((e: { data: unknown }) => void) | null }[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    installGeminiFakes();
    ports.length = 0;
    class N {
      port = { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() {
        ports.push(this.port);
      }
    }
    vi.stubGlobal("AudioWorkletNode", N);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const audioMsgs = (ws: FakeWS) => ws.sent.filter((m) => JSON.stringify(m).includes("audio/pcm")).length;
  async function live() {
    const s = await startGemini(gInfo, fakePrepared(), fakeHandlers());
    FakeWS.last.onopen?.();
    await FakeWS.last.emit({ setupComplete: {} });
    return { s, ws: FakeWS.last, frame: (rms: number) => ports[0].onmessage?.({ data: { pcm: new ArrayBuffer(2), level: rms, rms } }) };
  }

  it("flag on: stops sending in silence and sends audioStreamEnd once", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLIENT_VAD", "1");
    const { s, ws, frame } = await live();
    frame(0.2);
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(32);
      frame(0.001);
    }
    const sentInSilence = audioMsgs(ws);
    expect(sentInSilence).toBeLessThan(15); // speech frame + ~300 ms hangover, not 41
    expect(JSON.stringify(ws.sent).match(/audioStreamEnd/g)).toHaveLength(1);
    frame(0.2);
    expect(audioMsgs(ws)).toBeGreaterThan(sentInSilence);
    s.stop();
  });

  it("flag off (default): every frame is sent, no audioStreamEnd", async () => {
    const { s, ws, frame } = await live();
    for (let i = 0; i < 40; i++) frame(0.001);
    expect(audioMsgs(ws)).toBe(40);
    expect(JSON.stringify(ws.sent)).not.toContain("audioStreamEnd");
    s.stop();
  });
});
