// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { escapeHtml } from "@/lib/html";
import { isSafeUrl, cardToText } from "@/lib/ui-cards";
import { parseJson } from "@/lib/llm";

vi.mock("@upstash/redis", () => ({ Redis: vi.fn() }));

describe("escapeHtml", () => {
  it("neutralizes markup from transcripts before it goes into email", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">&'`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("ui cards", () => {
  it("only renders http(s) links", () => {
    expect(isSafeUrl("https://github.com/x")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,hi")).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
  });
  it("renders a plain-text version", () => {
    expect(cardToText({ id: "b", kind: "booking", title: "Book", when: "Tue 2 PM", url: "https://c.com/x" })).toBe("Book\nTue 2 PM\nhttps://c.com/x");
  });
});

describe("parseJson", () => {
  it("handles fenced and chatty model output", () => {
    expect(parseJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson<{ a: number }>('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(parseJson("nope")).toBeNull();
    expect(parseJson(undefined)).toBeNull();
  });
});

describe("rate limiting", () => {
  it("reads the edge-provided client IP", async () => {
    const { clientIp } = await import("@/lib/rate-limit");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "1.2.3.4" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });

  it("allows locally without Redis but refuses in a production deployment", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
    const { checkLimit } = await import("@/lib/rate-limit");
    expect((await checkLimit("sessionAnon", "ip")).ok).toBe(true);
    process.env.VERCEL_ENV = "production";
    expect((await checkLimit("sessionAnon", "ip")).ok).toBe(false);
    delete process.env.VERCEL_ENV;
  });
});

describe("parseJson with models that think out loud", () => {
  it("takes the last JSON object after reasoning text", () => {
    const out = '*   Goal: return {"a": 1} maybe?\n* Format: `{`\n\n{"summary":"ok","topics":["x"]}';
    expect(parseJson<{ summary: string }>(out)).toEqual({ summary: "ok", topics: ["x"] });
  });
});
