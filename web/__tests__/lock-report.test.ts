import { describe, it, expect, vi, beforeEach } from "vitest";
import { withLock } from "@/lib/rate-limit";
import { reportError, _resetReporter } from "@/lib/report-error";

describe("withLock (no Redis)", () => {
  it("excludes a second holder until released", async () => {
    const a = await withLock("t:lock", 25);
    expect(a).not.toBeNull();
    expect(await withLock("t:lock", 25)).toBeNull();
    await a!();
    expect(await withLock("t:lock", 25)).not.toBeNull();
  });
});

describe("reportError", () => {
  beforeEach(() => {
    _resetReporter();
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", { pathname: "/" });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => true) });
  });
  it("dedupes identical errors", () => {
    reportError(new Error("x"));
    reportError(new Error("x"));
    expect((navigator.sendBeacon as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
