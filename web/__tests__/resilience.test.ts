// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("dead Redis never breaks or slows a call (prod outage: Upstash DB deleted -> every connect 500'd)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://gone.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  });
  afterEach(() => {
    vi.doUnmock("@upstash/ratelimit");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("falls back to in-memory limits instead of throwing, and still enforces them", async () => {
    vi.doMock("@upstash/ratelimit", () => {
      class Ratelimit {
        static slidingWindow = () => ({});
        static fixedWindow = () => ({});
        async limit() {
          throw new TypeError("fetch failed: getaddrinfo ENOTFOUND gone.upstash.io");
        }
      }
      return { Ratelimit };
    });
    const { checkLimit } = await import("@/lib/rate-limit");
    const started = Date.now();
    const results = [];
    for (let i = 0; i < 7; i++) results.push((await checkLimit("sessionAnon", "1.2.3.4")).ok);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(results).toEqual([true, true, true, true, true, true, false]); // 6/hour per IP
  });

  it("safeRedis returns the fallback fast when Redis hangs", async () => {
    const { safeRedis } = await import("@/lib/rate-limit");
    const started = Date.now();
    const v = await safeRedis(() => new Promise<string>(() => {}), "fallback", 200);
    expect(v).toBe("fallback");
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("research_role is instant and honest by default (no LLM dead air)", () => {
  it("picks the right role-fit fact without calling any model", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { executeTool } = await import("@/lib/tool-executor");
    const t0 = Date.now();
    const fde = await executeTool("research_role", { company: "Anthropic", role: "Forward Deployed Engineer" }, { sessionId: "s" });
    const swe = await executeTool("research_role", { company: "Stripe", role: "Backend Engineer" }, { sessionId: "s" });
    expect(Date.now() - t0).toBeLessThan(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fde.result).toContain("forward-deployed");
    expect(fde.result).toContain("Anthropic");
    expect(swe.result).toContain("software and AI engineer");
    for (const r of [fde, swe]) expect(r.result).toMatch(/early in his career/);
    fetchSpy.mockRestore();
  });
});

describe("verifier context", () => {
  it("doesn't flag numbers the caller said (e.g. correcting '2025')", async () => {
    const { verifyTranscript } = await import("@/lib/verifier");
    const agent = ["Actually, he was a product intern in summer 2024, not a software engineer in 2025."];
    expect(verifyTranscript(agent, ["So he was a software engineer at Serotonin for most of 2025, right?"])).toEqual([]);
    expect(verifyTranscript(["He led a team of 40 engineers."], ["what did he do?"]).map((v) => v.rule)).toContain("number not in facts");
  });
});

describe("free text model fallback", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });
  it("tries the next free model on a 503 'high demand'", async () => {
    process.env.GEMINI_API_KEY = "k";
    vi.resetModules();
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response(JSON.stringify({ error: { code: 503 } }), { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"summary":"ok"}' }] } }] }), { status: 200 });
    });
    const { completeJSON } = await import("@/lib/llm");
    const out = await completeJSON<{ summary: string }>({ system: "s", user: "u", schema: {}, timeoutMs: 10_000 });
    expect(out).toEqual({ summary: "ok" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toBe(calls[1]);
  });
});
