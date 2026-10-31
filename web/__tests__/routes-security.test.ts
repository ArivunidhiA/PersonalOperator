// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: null })), currentUser: vi.fn(async () => null) }));
vi.mock("@/lib/gemini-token", () => ({
  GEMINI_WS_URL: "wss://example.test/ws",
  mintGeminiToken: vi.fn(async () => ({ token: "auth_tokens/fake", model: "gemini-3.8-live" })),
}));

// No network in unit tests: the text model is unavailable, so finish uses the deterministic summary.
vi.mock("@/lib/llm", () => ({ completeJSON: vi.fn(async () => null) }));

// Minimal in-memory Supabase stand-in that records writes.
const inserted: Record<string, unknown[]> = {};
const stored: { transcript: unknown[] | null } = { transcript: null };
vi.mock("@/lib/supabase", () => {
  const table = (name: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      maybeSingle: async () => (name === "call_summaries" && stored.transcript ? { data: { transcript: stored.transcript, summary: "s" } } : { data: null }),
      single: async () => ({ data: null }),
      upsert: async (row: unknown) => ((inserted[name] ??= []).push(row), { error: null }),
      insert: async (row: unknown) => ((inserted[name] ??= []).push(row), { error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => q,
    };
    return q;
  };
  return { getSupabase: () => ({ from: table }) };
});

beforeAll(() => {
  process.env.SESSION_SECRET = "security-test-secret-security-test-1";
  process.env.GEMINI_API_KEY = "k";
  process.env.DAILY_SESSION_CAP = "8";
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "RESEND_API_KEY", "LLM_PROVIDER", "OPENAI_API_KEY", "AI_GATEWAY_API_KEY"]) delete process.env[k];
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("session limits: one IP can't burn the shared daily cap", () => {
  it("denied requests don't consume global quota", async () => {
    const { POST } = await import("@/app/api/voice/session/route");
    const codes: (number | string)[] = [];
    for (let i = 0; i < 9; i++) {
      const r = await POST(post("/api/voice/session", {}, { "x-real-ip": "10.0.0.1", "x-ariv-client": "1" }));
      codes.push(r.status === 200 ? 200 : (await r.json()).code);
    }
    expect(codes).toEqual([200, 200, 200, 200, 200, 200, "rate_limited", "rate_limited", "rate_limited"]);
    // Global cap is 8: only the 6 granted sessions counted, so another visitor still gets in.
    const other = await POST(post("/api/voice/session", {}, { "x-real-ip": "10.0.0.2", "x-ariv-client": "1" }));
    expect(other.status).toBe(200);
  });
});

describe("paid OpenAI fallback fails closed", () => {
  it("refuses without shared Redis (can't enforce one call per ticket)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { mintTicket } = await import("@/lib/session-ticket");
    const { POST } = await import("@/app/api/voice/openai-sdp/route");
    const ticket = mintTicket({ sid: "s_oai", p: "openai", uid: null, em: null });
    const res = await POST(new Request("http://localhost/api/voice/openai-sdp", { method: "POST", headers: { "x-session-ticket": ticket }, body: "v=0\r\n" }));
    expect(res.status).toBe(503);
    delete process.env.OPENAI_API_KEY;
  });
});

describe("sharing is opt-in and refuses forged transcripts", () => {
  const oldTicket = async (sid: string) => {
    const { mintTicket } = await import("@/lib/session-ticket");
    return mintTicket({ sid, p: "gemini", uid: null, em: null }, Date.now() - 60_000);
  };
  it("finish never creates a share link on its own", async () => {
    const { POST } = await import("@/app/api/calls/finish/route");
    const res = await POST(post("/api/calls/finish", { ticket: await oldTicket("s_auto"), messages: [{ role: "user", text: "Where does he work?" }, { role: "assistant", text: "INZI Controls." }] }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data).not.toHaveProperty("share_token");
    expect(inserted.share_tokens ?? []).toHaveLength(0);
  });
  it("refuses to share when the 'agent' lines fail the fact check", async () => {
    stored.transcript = [
      { role: "user", text: "Who are you really?" },
      { role: "assistant", text: "I'm not an AI, I'm Ariv. I'm a senior engineer at INZI." },
    ];
    const { POST } = await import("@/app/api/calls/share/route");
    const res = await POST(new Request("http://localhost/api/calls/share", { method: "POST", headers: { "x-session-ticket": await oldTicket("s_forged") } }));
    expect(res.status).toBe(422);
    expect(inserted.share_tokens ?? []).toHaveLength(0);
  });
  it("refuses brand-new calls (no instant mint-and-publish)", async () => {
    const { mintTicket } = await import("@/lib/session-ticket");
    const { POST } = await import("@/app/api/calls/share/route");
    const fresh = mintTicket({ sid: "s_fresh", p: "gemini", uid: null, em: null });
    const res = await POST(new Request("http://localhost/api/calls/share", { method: "POST", headers: { "x-session-ticket": fresh } }));
    expect(res.status).toBe(422);
  });
  it("shares an honest transcript", async () => {
    stored.transcript = [
      { role: "user", text: "Where does he work right now?" },
      { role: "assistant", text: "He's at INZI Controls. The title says coordinator, but the work is basically forward-deployed." },
    ];
    const { POST } = await import("@/app/api/calls/share/route");
    const res = await POST(new Request("http://localhost/api/calls/share", { method: "POST", headers: { "x-session-ticket": await oldTicket("s_honest") } }));
    const data = await res.json();
    expect(data.share_token).toMatch(/^[0-9a-f]{32}$/);
  });
  it("share response includes a ~30 day expiry", async () => {
    stored.transcript = [{ role: "user", text: "Hi" }, { role: "assistant", text: "He's at INZI Controls." }];
    inserted.share_tokens = [];
    const { POST } = await import("@/app/api/calls/share/route");
    const res = await POST(new Request("http://localhost/api/calls/share", { method: "POST", headers: { "x-session-ticket": await oldTicket("s_expiry") } }));
    const data = await res.json();
    const days = (new Date(data.expires_at).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect((inserted.share_tokens[0] as { expires_at: string }).expires_at).toBe(data.expires_at);
  });
});

describe("share pages", () => {
  it("are noindex and reject malformed tokens", async () => {
    const { GET } = await import("@/app/api/calls/[token]/route");
    const res = await GET(new Request("http://localhost/api/calls/x"), { params: Promise.resolve({ token: "not-a-token" }) });
    expect(res.status).toBe(400);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });
});

describe("privacy config", () => {
  it("retentionDays defaults to 90, honours overrides, 0 disables", async () => {
    const { retentionDays } = await import("@/lib/analytics-store");
    const prev = process.env.RETENTION_DAYS;
    delete process.env.RETENTION_DAYS;
    expect(retentionDays()).toBe(90);
    process.env.RETENTION_DAYS = "30";
    expect(retentionDays()).toBe(30);
    process.env.RETENTION_DAYS = "0";
    expect(retentionDays()).toBe(0);
    process.env.RETENTION_DAYS = "abc";
    expect(retentionDays()).toBe(90);
    if (prev === undefined) delete process.env.RETENTION_DAYS; else process.env.RETENTION_DAYS = prev;
  });
  it("analyticsSalt prefers ANALYTICS_SALT, else HMAC of SESSION_SECRET", async () => {
    const { analyticsSalt } = await import("@/lib/visitor");
    const { createHmac } = await import("crypto");
    delete process.env.ANALYTICS_SALT;
    expect(analyticsSalt()).toBe(createHmac("sha256", process.env.SESSION_SECRET!).update("analytics").digest("hex"));
    process.env.ANALYTICS_SALT = "custom";
    expect(analyticsSalt()).toBe("custom");
    delete process.env.ANALYTICS_SALT;
  });
});
