// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: null })), currentUser: vi.fn(async () => null) }));

beforeAll(() => {
  process.env.SESSION_SECRET = "route-test-secret-route-test-secret-1";
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "GEMINI_API_KEY", "OPENAI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "RESEND_API_KEY", "CRON_SECRET"]) delete process.env[k];
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

async function ticket(extra: Partial<{ uid: string; em: string }> = {}) {
  const { mintTicket } = await import("@/lib/session-ticket");
  return mintTicket({ sid: "s_route", p: "gemini", uid: extra.uid ?? null, em: extra.em ?? null });
}

describe("/api/tools/execute", () => {
  it("refuses callers without a live-session ticket", async () => {
    const { POST } = await import("@/app/api/tools/execute/route");
    expect((await POST(post("/api/tools/execute", { name: "share_links", args: {} }))).status).toBe(401);
    expect((await POST(post("/api/tools/execute", { name: "share_links" }, { "x-session-ticket": "forged.ticket" }))).status).toBe(401);
  });
  it("rejects tools that don't exist (e.g. the removed email tool)", async () => {
    const { POST } = await import("@/app/api/tools/execute/route");
    const res = await POST(post("/api/tools/execute", { name: "send_confirmation_email", args: { to: "victim@x.com" } }, { "x-session-ticket": await ticket() }));
    expect(res.status).toBe(400);
  });
  it("runs a real tool for a valid ticket", async () => {
    const { POST } = await import("@/app/api/tools/execute/route");
    const res = await POST(post("/api/tools/execute", { name: "share_links", args: { links: ["github"] } }, { "x-session-ticket": await ticket() }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.card.links[0].url).toBe("https://github.com/ArivunidhiA");
  });
  it("caps body size", async () => {
    const { POST } = await import("@/app/api/tools/execute/route");
    const res = await POST(post("/api/tools/execute", { name: "retrieve_knowledge", args: { query: "x".repeat(10_000) } }, { "x-session-ticket": await ticket() }));
    expect(res.status).toBe(413);
  });
});

describe("/api/calls/finish", () => {
  it("requires a ticket", async () => {
    const { POST } = await import("@/app/api/calls/finish/route");
    expect((await POST(post("/api/calls/finish", { messages: [{ role: "user", text: "hi" }] }))).status).toBe(401);
  });
  it("skips calls where the caller never spoke (no junk summaries)", async () => {
    const { POST } = await import("@/app/api/calls/finish/route");
    const res = await POST(post("/api/calls/finish", { ticket: await ticket(), messages: [{ role: "assistant", text: "Hey! I'm Ariv's AI." }] }));
    expect(await res.json()).toEqual({ ok: true, skipped: true });
  });
});

describe("/api/calls/email", () => {
  it("only emails a signed-in caller's own verified address", async () => {
    const { POST } = await import("@/app/api/calls/email/route");
    expect((await POST(post("/api/calls/email", {}))).status).toBe(401);
    expect((await POST(post("/api/calls/email", {}, { "x-session-ticket": await ticket() }))).status).toBe(403);
  });
});

describe("/api/cron/maintenance", () => {
  it("fails closed without CRON_SECRET", async () => {
    const { GET } = await import("@/app/api/cron/maintenance/route");
    expect((await GET(new Request("http://localhost/api/cron/maintenance"))).status).toBe(401);
    process.env.CRON_SECRET = "c";
    expect((await GET(new Request("http://localhost/api/cron/maintenance", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    delete process.env.CRON_SECRET;
  });
});

describe("/api/voice/session", () => {
  it("reports offline (not a crash) when no voice engine is configured", async () => {
    const { POST } = await import("@/app/api/voice/session/route");
    const res = await POST(post("/api/voice/session", {}));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("offline");
  });
  it("blocks EEA/UK/CH visitors from the Gemini free tier", async () => {
    process.env.GEMINI_API_KEY = "k";
    const { POST } = await import("@/app/api/voice/session/route");
    const res = await POST(post("/api/voice/session", {}, { "x-vercel-ip-country": "DE" }));
    expect(res.status).toBe(451);
    expect((await res.json()).code).toBe("region");
    delete process.env.GEMINI_API_KEY;
  });
});
