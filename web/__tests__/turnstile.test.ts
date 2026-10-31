import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "@/lib/turnstile";

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  vi.unstubAllGlobals();
});

describe("verifyTurnstile", () => {
  it("fails open when no secret is configured", async () => {
    expect(await verifyTurnstile(null)).toBe(true);
  });
  it("requires a token and Cloudflare's success when configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    expect(await verifyTurnstile(null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: false })));
    expect(await verifyTurnstile("tok")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
    expect(await verifyTurnstile("tok")).toBe(true);
  });
});
