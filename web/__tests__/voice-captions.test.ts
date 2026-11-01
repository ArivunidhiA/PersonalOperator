import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startGemini } from "@/lib/voice/gemini";
import { startLiveCaption, type LiveCaptionOptions } from "@/lib/voice/live-caption";
import type { VoiceHandlers } from "@/lib/voice/types";
import { FakeWS, installGeminiFakes, fakePrepared, fakeHandlers, gInfo } from "./support/gemini-harness";

vi.mock("@/lib/voice/live-caption", () => ({ startLiveCaption: vi.fn() }));

const lc = () => ({ stop: vi.fn(), setMuted: vi.fn(), setAgentSpeaking: vi.fn(), addAgentText: vi.fn(), bargeIn: vi.fn() });
const mocked = vi.mocked(startLiveCaption);
const handlers = () => ({ ...fakeHandlers(), onCaption: vi.fn(), onCaptionCancel: vi.fn() }) as unknown as VoiceHandlers & { onCaption: ReturnType<typeof vi.fn>; onCaptionCancel: ReturnType<typeof vi.fn> };

async function start(h: VoiceHandlers = handlers()) {
  const s = await startGemini(gInfo, { ...fakePrepared() }, h);
  const ws = FakeWS.last;
  ws.onopen?.();
  await ws.emit({ setupComplete: {} });
  return { s, h, ws };
}

type Node = { port: { onmessage: ((e: unknown) => void) | null; postMessage: () => void } };
const nodes: Record<string, Node> = {};
class NamedNode {
  port = { onmessage: null, postMessage: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
  constructor(_ctx: unknown, name: string) {
    nodes[name] = this as unknown as Node;
  }
}
const playerSays = (speaking: boolean) => nodes["pcm-player"].port.onmessage?.({ data: { speaking, level: 0.5 } });

let cap: ReturnType<typeof lc>;
beforeEach(() => {
  vi.useFakeTimers();
  installGeminiFakes();
  vi.stubGlobal("AudioWorkletNode", NamedNode);
  cap = lc();
  mocked.mockReset();
  mocked.mockReturnValue(cap);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("captions in the call", () => {
  it("starts once, only after the call is live", async () => {
    const h = handlers();
    await startGemini(gInfo, { ...fakePrepared() }, h);
    expect(mocked).not.toHaveBeenCalled();
    FakeWS.last.onopen?.();
    await FakeWS.last.emit({ setupComplete: {} });
    expect(mocked).toHaveBeenCalledOnce();
  });

  it("stays off when nobody listens for captions (the OpenAI-style handlers)", async () => {
    await start(fakeHandlers());
    expect(mocked).not.toHaveBeenCalled();
  });

  it("passes captions and withdrawals to the handlers", async () => {
    const { h } = await start();
    const opts = mocked.mock.calls[0][1] as LiveCaptionOptions;
    opts.onCaption({ utterance: 1, text: "hi", settled: 0, final: false });
    opts.onCancel?.();
    expect(h.onCaption).toHaveBeenCalledWith({ utterance: 1, text: "hi", settled: 0, final: false });
    expect(h.onCaptionCancel).toHaveBeenCalledOnce();
  });

  it("tells captions what the agent is saying, before the guard holds any of it back", async () => {
    const { ws } = await start();
    await ws.emit({ serverContent: { outputTranscription: { text: "He built forecost" } } });
    expect(cap.addAgentText).toHaveBeenCalledWith("He built forecost");
  });

  it("follows the player's speaking state", async () => {
    await start();
    playerSays(true);
    expect(cap.setAgentSpeaking).toHaveBeenCalledWith(true);
  });

  it("releases held captions on barge-in", async () => {
    const { ws } = await start();
    await ws.emit({ serverContent: { interrupted: true } });
    expect(cap.bargeIn).toHaveBeenCalledOnce();
  });

  it("mutes captions with the call", async () => {
    const { s } = await start();
    s.setMuted(true);
    expect(cap.setMuted).toHaveBeenCalledWith(true);
  });

  it("keeps the same captions through a reconnect", async () => {
    const { h, ws } = await start();
    ws.readyState = 3;
    ws.onclose?.({ code: 1011, reason: "Internal error" });
    await vi.advanceTimersByTimeAsync(2000);
    FakeWS.last.onopen?.();
    await FakeWS.last.emit({ setupComplete: {} });
    expect(mocked).toHaveBeenCalledOnce();
    expect(cap.stop).not.toHaveBeenCalled();
    (mocked.mock.calls[0][1] as LiveCaptionOptions).onCaption({ utterance: 2, text: "still here", settled: 0, final: false });
    expect(h.onCaption).toHaveBeenCalledOnce();
  });

  it("stops with the call, before the mic goes", async () => {
    const { s } = await start();
    s.stop();
    expect(cap.stop).toHaveBeenCalledOnce();
  });
});

describe("captions failing never touches the call", () => {
  it("survives a throw at start", async () => {
    mocked.mockImplementation(() => {
      throw new Error("captions broke");
    });
    const { h, ws } = await start();
    await ws.emit({ serverContent: { inputTranscription: { text: "hello" } } });
    expect(h.onUserDelta).toHaveBeenCalledWith("hello");
    expect(h.onEnded).not.toHaveBeenCalled();
  });

  it("survives every method throwing", async () => {
    const bad = () => {
      throw new Error("captions broke");
    };
    mocked.mockReturnValue({ stop: bad, setMuted: bad, setAgentSpeaking: bad, addAgentText: bad, bargeIn: bad });
    const { s, h, ws } = await start();
    await ws.emit({ serverContent: { outputTranscription: { text: "Hey there." } } });
    await ws.emit({ serverContent: { interrupted: true } });
    playerSays(true);
    expect(() => s.setMuted(true)).not.toThrow();
    expect(() => s.stop()).not.toThrow();
    expect(h.onEnded).toHaveBeenCalledOnce();
  });

  it("a throwing caption handler stays out of the call", async () => {
    const h = handlers();
    h.onCaption.mockImplementation(() => {
      throw new Error("ui bug");
    });
    await start(h);
    expect(() => (mocked.mock.calls[0][1] as LiveCaptionOptions).onCaption({ utterance: 1, text: "x", settled: 0, final: false })).not.toThrow();
  });
});
