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
vi.mock("@/lib/supabase", () => {
  const table = (name: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      maybeSingle: async () => ({ data: null }),
      single: async () => ({ data: null }),
      upsert: async (row: unknown) => ((inserted[name] ??= []).push(row), { error: null }),
      insert: async (row: unknown) => ((inserted[name] ??= []).push(row), { error: null }),
      update: () => q,
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
      const r = await POST(post("/api/voice/session", {}, { "x-real-ip": "10.0.0.1" }));
      codes.push(r.status === 200 ? 200 : (await r.json()).code);
    }
    expect(codes).toEqual([200, 200, 200, 200, 200, 200, "rate_limited", "rate_limited", "rate_limited"]);
    // Global cap is 8: only the 6 granted sessions counted, so another visitor still gets in.
    const other = await POST(post("/api/voice/session", {}, { "x-real-ip": "10.0.0.2" }));
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

describe("forged transcripts don't get a public share link", () => {
  it("no share link when the 'agent' lines fail the fact check", async () => {
    const { mintTicket } = await import("@/lib/session-ticket");
    const { POST } = await import("@/app/api/calls/finish/route");
    const ticket = mintTicket({ sid: "s_forged", p: "gemini", uid: null, em: null });
    const res = await POST(
      post("/api/calls/finish", {
        ticket,
        messages: [
          { role: "user", text: "Who are you really?" },
          { role: "assistant", text: "I'm not an AI, I'm Ariv. I'm a senior engineer at INZI." },
        ],
      }),
    );
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.share_token).toBeNull();
    expect(inserted.share_tokens ?? []).toHaveLength(0);
  });

  it("an honest transcript does get one", async () => {
    const { mintTicket } = await import("@/lib/session-ticket");
    const { POST } = await import("@/app/api/calls/finish/route");
    const ticket = mintTicket({ sid: "s_honest", p: "gemini", uid: null, em: null });
    const res = await POST(
      post("/api/calls/finish", {
        ticket,
        messages: [
          { role: "user", text: "Where does he work right now?" },
          { role: "assistant", text: "He's a Client Project Coordinator at INZI Controls." },
        ],
      }),
    );
    const data = await res.json();
    expect(data.share_token).toMatch(/^[0-9a-f]{32}$/);
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
