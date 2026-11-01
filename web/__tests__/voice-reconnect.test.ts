import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startGemini } from "@/lib/voice/gemini";
import { FakeWS, installGeminiFakes, fakePrepared, fakeHandlers, gInfo } from "./support/gemini-harness";

const AUDIO = { inlineData: { data: "AAAA" } };
const greetings = (ws: FakeWS) => ws.sent.filter((m) => JSON.stringify(m).includes('"text":"hi"'));
const setups = (ws: FakeWS) => ws.sent.filter((m) => "setup" in m) as { setup: { model: string; sessionResumption?: { handle: string } } }[];

async function start() {
  const h = fakeHandlers();
  const s = await startGemini(gInfo, { ...fakePrepared() }, h);
  const ws = FakeWS.last;
  ws.onopen?.();
  await ws.emit({ setupComplete: {} });
  return { s, h, ws };
}
const turn = async (ws: FakeWS, user: string, agent: string) => {
  await ws.emit({ voiceActivity: { type: "ACTIVITY_START" } });
  await ws.emit({ voiceActivity: { type: "ACTIVITY_END" } });
  await ws.emit({ serverContent: { inputTranscription: { text: user } } });
  await ws.emit({ serverContent: { modelTurn: { parts: [AUDIO] }, outputTranscription: { text: agent } } });
  await ws.emit({ serverContent: { turnComplete: true } });
};
const drop = (ws: FakeWS, code = 1011, reason = "Internal error") => {
  ws.readyState = 3;
  ws.onclose?.({ code, reason });
};
const reconnected = async (ws: FakeWS) => {
  await vi.advanceTimersByTimeAsync(2000);
  const next = FakeWS.last;
  expect(next).not.toBe(ws);
  next.onopen?.();
  await next.emit({ setupComplete: {} });
  return next;
};

beforeEach(() => {
  vi.useFakeTimers();
  installGeminiFakes();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("session resumption", () => {
  it("reconnects on 1011 with the same token and the stored handle, without ending the call or greeting again", async () => {
    const { s, h, ws } = await start();
    await ws.emit({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    drop(ws);
    const next = await reconnected(ws);
    expect(next.url).toBe(ws.url);
    expect(setups(next)[0].setup.sessionResumption).toEqual({ handle: "h1" });
    expect(greetings(next)).toHaveLength(0);
    expect(h.onLive).toHaveBeenCalledTimes(1);
    expect(h.onEnded).not.toHaveBeenCalled();
    expect(s.liveAt?.()).not.toBeNull();
    s.stop();
  });

  it("ignores an update that is not resumable", async () => {
    const { s, ws } = await start();
    await ws.emit({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    await ws.emit({ sessionResumptionUpdate: { newHandle: "h2", resumable: false } });
    drop(ws);
    const next = await reconnected(ws);
    expect(setups(next)[0].setup.sessionResumption).toEqual({ handle: "h1" });
    s.stop();
  });

  it("re-seeds turns newer than the handle, as history that asks for no reply (F-8)", async () => {
    const { s, ws } = await start();
    await ws.emit({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    await vi.advanceTimersByTimeAsync(1000);
    await turn(ws, "My name is Zed", "Hey Zed.");
    drop(ws);
    const next = await reconnected(ws);
    const seed = next.sent.find((m) => "clientContent" in m) as { clientContent: { turns: { role: string; parts: { text: string }[] }[]; turnComplete: boolean } };
    expect(seed.clientContent.turnComplete).toBe(false);
    expect(seed.clientContent.turns).toEqual([
      { role: "user", parts: [{ text: "My name is Zed" }] },
      { role: "model", parts: [{ text: "Hey Zed." }] },
    ]);
    s.stop();
  });

  it("does not re-seed turns the handle already covers", async () => {
    const { s, ws } = await start();
    await turn(ws, "My name is Zed", "Hey Zed.");
    await vi.advanceTimersByTimeAsync(1000);
    await ws.emit({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    drop(ws);
    const next = await reconnected(ws);
    expect(next.sent.some((m) => "clientContent" in m)).toBe(false);
    s.stop();
  });

  it("picks the reply back up if the drop cut it off", async () => {
    const { s, ws } = await start();
    await ws.emit({ serverContent: { modelTurn: { parts: [AUDIO] }, outputTranscription: { text: "He ships" } } });
    drop(ws);
    const next = await reconnected(ws);
    expect(JSON.stringify(next.sent)).toContain("(The caller is waiting");
    s.stop();
  });

  it("holds mic audio during the gap and sends it after setup", async () => {
    const nodes: { port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: () => void } }[] = [];
    class N {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() {
        nodes.push(this);
      }
    }
    vi.stubGlobal("AudioWorkletNode", N);
    const { s, ws } = await start();
    drop(ws);
    nodes[0].port.onmessage?.({ data: { pcm: new ArrayBuffer(2), level: 0.1, rms: 0.1 } });
    const next = await reconnected(ws);
    expect(next.sent.filter((m) => JSON.stringify(m).includes("audio/pcm"))).toHaveLength(1);
    s.stop();
  });

  it("caps reconnects at two per call, then ends with the dropped message", async () => {
    const { s, h, ws } = await start();
    drop(ws);
    const a = await reconnected(ws);
    drop(a);
    const b = await reconnected(a);
    drop(b);
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWS.last).toBe(b);
    expect(h.onEnded).toHaveBeenCalledWith("dropped", expect.stringMatching(/dropped/i));
    s.stop();
  });

  it("a failed reconnect attempt uses the budget and ends cleanly", async () => {
    const { s, h, ws } = await start();
    drop(ws);
    await vi.advanceTimersByTimeAsync(2000);
    drop(FakeWS.last, 1011, "Token has been used too many times");
    await vi.advanceTimersByTimeAsync(3000);
    drop(FakeWS.last, 1011, "Token has been used too many times");
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.onEnded).toHaveBeenCalledWith("dropped", expect.anything());
    s.stop();
  });

  it("reconnects when the server closes with 1000, since the app starts every real hang-up itself (F-11)", async () => {
    const { ws, h } = await start();
    drop(ws, 1000, "");
    await reconnected(ws);
    expect(h.onEnded).not.toHaveBeenCalled();
  });

  it("does not reconnect on quota, after the caller hangs up, or before the call was live", async () => {
    const a = await start();
    drop(a.ws, 1011, "RESOURCE_EXHAUSTED");
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeWS.last).toBe(a.ws);
    expect(a.h.onEnded).toHaveBeenCalledWith("quota", expect.anything());

    const b = await start();
    b.s.stop();
    drop(b.ws, 1000, "");
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeWS.last).toBe(b.ws);
    expect(b.h.onEnded).toHaveBeenCalledWith("hangup", undefined);

    const h = fakeHandlers();
    await startGemini(gInfo, { ...fakePrepared() }, h);
    const c = FakeWS.last;
    drop(c);
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeWS.last).toBe(c);
    expect(h.onEnded).toHaveBeenCalledWith("error", expect.anything());
  });

  it("goAway: moves to a new connection after the current turn, no goodbye", async () => {
    const { s, h, ws } = await start();
    await ws.emit({ goAway: { timeLeft: "30s" } });
    expect(FakeWS.last).toBe(ws);
    await ws.emit({ serverContent: { modelTurn: { parts: [AUDIO] } } });
    await ws.emit({ serverContent: { turnComplete: true } });
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeWS.last).not.toBe(ws);
    expect(h.onEnded).not.toHaveBeenCalled();
    s.stop();
  });

  it("goAway: moves before the deadline if the turn never finishes", async () => {
    const { s, ws } = await start();
    await ws.emit({ serverContent: { modelTurn: { parts: [AUDIO] } } });
    await ws.emit({ goAway: { timeLeft: "5s" } });
    await vi.advanceTimersByTimeAsync(4000);
    expect(FakeWS.last).not.toBe(ws);
    s.stop();
  });

  it("goAway with no reconnects left still ends cleanly", async () => {
    const { s, h, ws } = await start();
    drop(ws);
    const a = await reconnected(ws);
    drop(a);
    const b = await reconnected(a);
    await b.emit({ goAway: { timeLeft: "5s" } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWS.last).toBe(b);
    expect(h.onEnded).toHaveBeenCalledWith("time", expect.anything());
    s.stop();
  });
});

describe("tool responses", () => {
  it("tell the model not to repeat what it said before the call (F-9)", async () => {
    const { s, ws } = await start();
    await ws.emit({ toolCall: { functionCalls: [{ id: "1", name: "share_links", args: {} }] } });
    await vi.advanceTimersByTimeAsync(0);
    const r = ws.sent.find((m) => "toolResponse" in m) as { toolResponse: { functionResponses: { response: { note?: string } }[] } };
    expect(r.toolResponse.functionResponses[0].response.note).toMatch(/repeat/i);
    s.stop();
  });
});
