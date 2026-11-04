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
// `call` is the saved row a share page reads (single()); `transcript` is what maybeSingle() sees.
const stored: { transcript: unknown[] | null; call: Record<string, unknown> | null } = { transcript: null, call: null };
vi.mock("@/lib/supabase", () => {
  const table = (name: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      maybeSingle: async () => (name === "call_summaries" && stored.transcript ? { data: { transcript: stored.transcript, summary: "s" } } : { data: null }),
      single: async () =>
        !stored.call ? { data: null } : name === "share_tokens" ? { data: { session_id: "s_view", expires_at: null } } : name === "call_summaries" ? { data: stored.call } : { data: null },
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

// A response's shape: status, keys, and each value's type (tokens and dates differ per call).
const shapeOf = async (res: Response) => {
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, shape: Object.keys(body).sort().map((k) => [k, typeof body[k]]) };
};

const oldTicket = async (sid: string) => {
  const { mintTicket } = await import("@/lib/session-ticket");
  return mintTicket({ sid, p: "gemini", uid: null, em: null }, Date.now() - 60_000);
};
const shareReq = async (sid: string) => new Request("http://localhost/api/calls/share", { method: "POST", headers: { "x-session-ticket": await oldTicket(sid) } });

// Three saved calls: a term on the confidential list, a wrong guess, and no name at all.
const CALLS = {
  hit: [{ role: "user", text: "Does he work with Acmeauto?" }, { role: "assistant", text: "He works on the Acmeauto account." }],
  miss: [{ role: "user", text: "Does he work with Northwind?" }, { role: "assistant", text: "He works on the Northwind account." }],
  none: [{ role: "user", text: "Where does he work?" }, { role: "assistant", text: "He's at INZI Controls." }],
};

describe("share links can't confirm or deny a confidential name", () => {
  it("needs a ticket", async () => {
    const { POST } = await import("@/app/api/calls/share/route");
    expect((await POST(new Request("http://localhost/api/calls/share", { method: "POST" }))).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/calls/share", { method: "POST", headers: { "x-session-ticket": "forged.ticket" } }))).status).toBe(401);
  });
  it("answers a confidential term, a wrong guess and no name with the same status, keys and shape", async () => {
    process.env.BANNED_TERMS = "acmeauto";
    const { POST } = await import("@/app/api/calls/share/route");
    const shapes = [];
    for (const [k, transcript] of Object.entries(CALLS)) {
      stored.transcript = transcript;
      const res = await POST(await shareReq(`s_oracle_${k}`));
      expect(res.status).toBe(200);
      const clone = res.clone();
      expect((await clone.json()).share_token).toMatch(/^[0-9a-f]{32}$/);
      shapes.push(await shapeOf(res));
    }
    expect(shapes[1]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[0]);
    delete process.env.BANNED_TERMS;
  });
  it("never reads the transcript: the link comes from the server copy, not from text sent with the request", async () => {
    stored.transcript = CALLS.none;
    const { POST } = await import("@/app/api/calls/share/route");
    const req = new Request("http://localhost/api/calls/share", {
      method: "POST",
      headers: { "x-session-ticket": await oldTicket("s_body"), "Content-Type": "application/json" },
      body: JSON.stringify({ messages: CALLS.hit }),
    });
    expect(await shapeOf(await POST(req))).toEqual(await shapeOf(await POST(await shareReq("s_nobody"))));
  });
  it("gives one neutral, retryable answer when nothing is saved yet or the call is brand new", async () => {
    stored.transcript = null;
    const { POST } = await import("@/app/api/calls/share/route");
    const { mintTicket } = await import("@/lib/session-ticket");
    const a = await POST(await shareReq("s_unsaved_a"));
    const b = await POST(await shareReq("s_unsaved_b"));
    stored.transcript = CALLS.hit;
    const fresh = await POST(new Request("http://localhost/api/calls/share", { method: "POST", headers: { "x-session-ticket": mintTicket({ sid: "s_fresh", p: "gemini", uid: null, em: null }) } }));
    const bodies = [await a.text(), await b.text(), await fresh.text()];
    expect([a.status, b.status, fresh.status]).toEqual([409, 409, 409]);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).retry).toBe(true);
  });
});

describe("the public share page is name-blind", () => {
  const view = async (transcript: unknown[], extra: Record<string, unknown> = {}) => {
    stored.call = { session_id: "s_view", caller_name: "Sam", company: null, intent: "general_inquiry", summary: "Caller asked a question.", topics: [], transcript, outcome: "info_provided", created_at: "2026-11-01T00:00:00Z", ...extra };
    const { GET } = await import("@/app/api/calls/[token]/route");
    const res = await GET(new Request("http://localhost/api/calls/x"), { params: Promise.resolve({ token: "a".repeat(32) }) });
    stored.call = null;
    return res;
  };
  it("shows no caller name, no company field, and only 'You' and 'Ariv's AI'", async () => {
    const res = await view([{ role: "user", text: "Hi, I'm Sam from Acmeauto." }, { role: "assistant", text: "Hey Sam! He's at INZI Controls." }], { company: "Acmeauto" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("caller");
    expect(body).not.toHaveProperty("company");
    expect(body.transcript.map((m: { role: string }) => m.role)).toEqual(["You", "Ariv's AI"]);
    expect(JSON.stringify(body)).not.toMatch(/sam|acmeauto/i);
    expect(JSON.stringify(body)).toContain("INZI Controls");
  });
  it("scrubs a confidential term and a wrong guess the same way, in every line, the summary and topics", async () => {
    process.env.BANNED_TERMS = "acmeauto";
    const pageFor = async (name: string) => {
      const lines = [
        { role: "user", text: `${name} is hiring. Does he know the ${name} team?` },
        { role: "assistant", text: `I can't speak to ${name}. He's at INZI Controls.` },
      ];
      const res = await view(lines, { summary: `Caller asked about ${name}.`, topics: [`${name} hiring`, "Python"] });
      return { status: res.status, text: await res.text() };
    };
    const hit = await pageFor("Acmeauto");
    const miss = await pageFor("Northwind");
    expect(hit.text).not.toMatch(/acmeauto/i);
    expect(miss.text).not.toMatch(/northwind/i);
    // Byte-for-byte the same page, so nothing about it depends on which name was said.
    expect(hit).toEqual(miss);
    const none = await view(CALLS.none);
    expect(await shapeOf(none)).toEqual(await shapeOf(await view(CALLS.hit)));
    delete process.env.BANNED_TERMS;
  });
});

describe("sharing is opt-in", () => {
  it("finish never creates a share link on its own", async () => {
    inserted.share_tokens = [];
    const { POST } = await import("@/app/api/calls/finish/route");
    const res = await POST(post("/api/calls/finish", { ticket: await oldTicket("s_auto"), messages: [{ role: "user", text: "Where does he work?" }, { role: "assistant", text: "INZI Controls." }] }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data).not.toHaveProperty("share_token");
    expect(inserted.share_tokens ?? []).toHaveLength(0);
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
