import { vi } from "vitest";
import type { VoiceHandlers } from "@/lib/voice/types";

/** Fake browser audio + WebSocket so startGemini() can run under jsdom. */
export class FakeWS {
  static OPEN = 1;
  static CONNECTING = 0;
  static last: FakeWS;
  readyState = 1;
  binaryType = "";
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => unknown) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) {
    FakeWS.last = this;
  }
  send(s: string) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.readyState = 3;
  }
  async emit(msg: unknown) {
    await this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

class FakeNode {
  port = { onmessage: null as ((e: unknown) => void) | null, postMessage: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

export function installGeminiFakes() {
  vi.stubGlobal("WebSocket", FakeWS);
  vi.stubGlobal("AudioWorkletNode", FakeNode);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ result: "ok" }) })));
}

export function fakePrepared() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null };
  const ctx = {
    audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
    createMediaStreamSource: () => new FakeNode(),
    createMediaStreamDestination: () => ({ stream: { getTracks: () => [] } }),
    destination: {},
    resume: () => Promise.resolve(),
    close: vi.fn(() => Promise.resolve()),
    state: "running",
    onstatechange: null as (() => void) | null,
  };
  const mic = { getTracks: () => [track], getAudioTracks: () => [track] };
  return { ctx: ctx as unknown as AudioContext, mic: mic as unknown as MediaStream };
}

export const gInfo = {
  provider: "gemini" as const,
  sessionId: "s",
  ticket: "t",
  maxCallSeconds: 600,
  gemini: { token: "tok", model: "m", wsUrl: "ws://x", greeting: "hi" },
};

export function fakeHandlers(): VoiceHandlers {
  return {
    onLive: vi.fn(),
    onUserDelta: vi.fn(),
    onUserFinal: vi.fn(),
    onAgentDelta: vi.fn(),
    onAgentFinal: vi.fn(),
    onAgentSpeaking: vi.fn(),
    onToolStart: vi.fn(),
    onToolEnd: vi.fn(),
    onEnded: vi.fn(),
  };
}

export const NUDGE = "(The caller is waiting";
export const nudges = (ws: FakeWS) =>
  ws.sent.filter((m) => JSON.stringify(m).includes(NUDGE));
