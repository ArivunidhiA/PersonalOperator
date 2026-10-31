import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/voice/gemini", () => ({ prepareAudio: vi.fn(), startGemini: vi.fn() }));
vi.mock("@/lib/voice/openai", () => ({ startOpenAI: vi.fn() }));
vi.mock("@/lib/track-client", () => ({ sessionHints: () => ({}) }));

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("worklet prefetch", () => {
  it("fetches both worklet modules once at module init", async () => {
    const f = vi.fn(() => Promise.resolve(new Response("")));
    vi.stubGlobal("fetch", f);
    const m = await import("@/lib/voice/start");
    expect(f.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["/audio/pcm-capture.js", "/audio/pcm-player.js"]);
    m.prefetchWorklets();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("swallows prefetch failures", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await expect(import("@/lib/voice/start")).resolves.toBeTruthy();
  });

  it("does nothing without a window (SSR)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    vi.stubGlobal("window", undefined);
    await import("@/lib/voice/start");
    expect(f).not.toHaveBeenCalled();
  });
});
