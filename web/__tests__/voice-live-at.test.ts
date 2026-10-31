import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startGemini } from "@/lib/voice/gemini";
import { FakeWS, installGeminiFakes, fakePrepared, fakeHandlers, gInfo } from "./support/gemini-harness";

beforeEach(() => {
  vi.useFakeTimers();
  installGeminiFakes();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("gemini liveAt", () => {
  it("is null until setupComplete, then the epoch ms of setupComplete, and never moves", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const s = await startGemini(gInfo, fakePrepared(), fakeHandlers());
    const ws = FakeWS.last;
    ws.onopen?.();
    expect(s.liveAt?.()).toBeNull();

    vi.setSystemTime(new Date("2026-01-01T00:00:03Z"));
    await ws.emit({ setupComplete: {} });
    const t = Date.parse("2026-01-01T00:00:03Z");
    expect(s.liveAt?.()).toBe(t);

    vi.setSystemTime(new Date("2026-01-01T00:00:09Z"));
    await ws.emit({ setupComplete: {} });
    expect(s.liveAt?.()).toBe(t);
    s.stop();
  });
});
