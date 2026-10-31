import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const prepareAudio = vi.fn();
const startGemini = vi.fn();
vi.mock("@/lib/voice/gemini", () => ({ prepareAudio: () => prepareAudio(), startGemini: (...a: unknown[]) => startGemini(...a) }));
vi.mock("@/lib/voice/openai", () => ({ startOpenAI: vi.fn() }));
vi.mock("@/lib/turnstile-client", () => ({ turnstileToken: () => Promise.resolve(null) }));
vi.mock("@/lib/track-client", () => ({ sessionHints: () => ({}) }));

import { startVoiceCall } from "@/lib/voice/start";

const handlers = {} as never;
const info = { provider: "gemini", sessionId: "s", ticket: "t", maxCallSeconds: 60, gemini: { token: "x", model: "m", wsUrl: "w", greeting: "g" } };
const makePrepared = () => {
  const track = { stop: vi.fn() };
  return { ctx: { close: vi.fn(() => Promise.resolve()) }, mic: { getTracks: () => [track] }, track };
};
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const abortable = (init: RequestInit) =>
  new Promise((_r, rej) => {
    const fail = () => rej(new DOMException("a", "AbortError"));
    if (init.signal!.aborted) fail();
    else init.signal!.addEventListener("abort", fail);
  });

beforeEach(() => {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
  startGemini.mockResolvedValue({ stop() {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("startVoiceCall concurrency", () => {
  it("starts the mic and the session fetch in the same tick, before either resolves", async () => {
    const p = makePrepared();
    let resolveMic!: (v: unknown) => void;
    prepareAudio.mockReturnValue(new Promise((r) => (resolveMic = r)));
    const fetchMock = vi.fn(() => ok(info));
    vi.stubGlobal("fetch", fetchMock);
    const call = startVoiceCall(handlers);
    expect(prepareAudio).toHaveBeenCalledTimes(1);
    await Promise.resolve(); // let the turnstile token resolve; the mic is still pending
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1); // fetch did not wait for mic permission
    resolveMic(p);
    await call;
    expect(startGemini).toHaveBeenCalledTimes(1);
    expect(p.track.stop).not.toHaveBeenCalled();
  });

  it("releases the mic when the session fetch fails", async () => {
    const p = makePrepared();
    prepareAudio.mockResolvedValue(p);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ error: "busy", code: "rate" }) })));
    await expect(startVoiceCall(handlers)).rejects.toMatchObject({ code: "rate" });
    expect(p.track.stop).toHaveBeenCalled();
    expect(p.ctx.close).toHaveBeenCalled();
  });

  it("maps network failure and releases the mic", async () => {
    const p = makePrepared();
    prepareAudio.mockResolvedValue(p);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("net"))));
    await expect(startVoiceCall(handlers)).rejects.toMatchObject({ code: "network" });
    expect(p.track.stop).toHaveBeenCalled();
  });

  it("aborts the session fetch and reports mic_denied when permission is refused", async () => {
    prepareAudio.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    let fetchSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => {
        fetchSignal = init.signal as AbortSignal;
        return abortable(init);
      }),
    );
    await expect(startVoiceCall(handlers)).rejects.toMatchObject({ code: "mic_denied" });
    expect(fetchSignal?.aborted).toBe(true);
  });

  it("releases a mic that resolves after the caller aborted", async () => {
    const p = makePrepared();
    let resolveMic!: (v: unknown) => void;
    prepareAudio.mockReturnValue(new Promise((r) => (resolveMic = r)));
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => abortable(init)));
    const ac = new AbortController();
    const call = startVoiceCall(handlers, ac.signal);
    const assertion = expect(call).rejects.toMatchObject({ code: "cancelled" });
    ac.abort();
    resolveMic(p);
    await assertion;
    expect(p.track.stop).toHaveBeenCalled();
    expect(startGemini).not.toHaveBeenCalled();
  });

  it("releases the mic when gemini setup fails", async () => {
    const p = makePrepared();
    prepareAudio.mockResolvedValue(p);
    vi.stubGlobal("fetch", vi.fn(() => ok(info)));
    startGemini.mockRejectedValue(new Error("boom"));
    await expect(startVoiceCall(handlers)).rejects.toMatchObject({ code: "setup" });
    expect(p.track.stop).toHaveBeenCalled();
  });
});
