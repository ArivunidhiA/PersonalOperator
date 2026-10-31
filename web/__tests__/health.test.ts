// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const supa = vi.fn();
const redis = vi.fn();
vi.mock("@/lib/supabase", () => ({ getSupabase: () => supa() }));
vi.mock("@/lib/rate-limit", () => ({ getRedis: () => redis() }));

const okDb = { from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) };
const badDb = { from: () => ({ select: () => ({ limit: async () => ({ error: { message: "x" } }) }) }) };
const okRedis = { ping: async () => "PONG" };
const downRedis = {
  ping: async () => {
    throw new Error("down");
  },
};

async function hit() {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "k";
  supa.mockReturnValue(okDb);
  redis.mockReturnValue(okRedis);
});

describe("GET /api/health", () => {
  it("200 when everything is up", async () => {
    const r = await hit();
    expect(r.status).toBe(200);
    expect(r.body.checks).toEqual({ supabase: "ok", redis: "ok", gemini: "ok" });
  });
  it("503 when Supabase errors", async () => {
    supa.mockReturnValue(badDb);
    expect((await hit()).status).toBe(503);
  });
  it("503 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await hit();
    expect(r.status).toBe(503);
    expect(r.body.checks.gemini).toBe("fail");
  });
  it("503 when Redis is configured but down; 200 when unconfigured", async () => {
    redis.mockReturnValue(downRedis);
    expect((await hit()).status).toBe(503);
    redis.mockReturnValue(null);
    expect((await hit()).status).toBe(200);
  });
});
