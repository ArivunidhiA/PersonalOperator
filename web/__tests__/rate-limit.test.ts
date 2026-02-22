import { describe, it, expect, vi } from "vitest";

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(),
}));

describe("getRateLimiter", () => {
  it("returns null when env vars are missing", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    vi.resetModules();
    const { getRateLimiter } = await import("@/lib/rate-limit");
    const limiter = getRateLimiter();
    expect(limiter).toBeNull();
  });
});
