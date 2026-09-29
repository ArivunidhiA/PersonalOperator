// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";

/**
 * F-05: after the call email is sent, the call record keeps Resend's email id,
 * so "did Ariv get notified?" can be checked at the source of truth (Vercel
 * only surfaces the first log line of a request).
 */
type Op = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
const ops: Op[] = [];

function builder(table: string) {
  const state: Op = { table, op: "select", filters: [] };
  const result = () => {
    if (state.op === "select" && table === "call_summaries") return { data: null, error: null };
    if (state.op === "select") return { data: [], error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (payload: unknown) => ((state.op = "insert"), (state.payload = payload), ops.push(state), b),
    update: (payload: unknown) => ((state.op = "update"), (state.payload = payload), ops.push(state), b),
    eq: (col: string, v: unknown) => (state.filters.push([col, v]), b),
    order: () => b,
    limit: () => b,
    maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => void) => resolve(result()),
  };
  return b;
}

vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from: (t: string) => builder(t) }) }));
vi.mock("@/lib/llm", () => ({
  completeJSON: vi.fn(async () => ({ summary: "Asked about forecost.", intent: "recruiter", topics: ["forecost"], outcome: "info_provided", caller_name: "Sam", caller_role: "recruiter", company: "Acme", role: null })),
}));
const sent: unknown[] = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async (msg: unknown) => (sent.push(msg), { data: { id: "re_test_123" }, error: null })) };
  },
}));

beforeAll(() => {
  process.env.SESSION_SECRET = "finish-notify-secret-finish-notify-1";
  process.env.RESEND_API_KEY = "re_fake";
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
});

describe("call email bookkeeping (F-05)", () => {
  it("stores Resend's email id on the call after notifying Ariv", async () => {
    const { mintTicket } = await import("@/lib/session-ticket");
    const { POST } = await import("@/app/api/calls/finish/route");
    const ticket = mintTicket({ sid: "s_notify_AbCdEfGhIjKl", p: "gemini", uid: null, em: null, vid: "v_0123456789abcdef" });
    const res = await POST(
      new Request("http://localhost/api/calls/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" },
        body: JSON.stringify({ ticket, messages: [{ role: "assistant", text: "Hey! I'm Ariv's AI." }, { role: "user", text: "What's forecost?" }] }),
      }),
    );
    expect((await res.json()).ok).toBe(true);
    expect(sent).toHaveLength(1);
    const notified = ops.find((o) => o.table === "call_summaries" && o.op === "update" && JSON.stringify(o.payload).includes("re_test_123"));
    expect(notified, "an update that records the email id").toBeTruthy();
    expect((notified!.payload as { context: { notified: { emailId: string; at: string } } }).context.notified.emailId).toBe("re_test_123");
    expect(notified!.filters).toContainEqual(["session_id", "s_notify_AbCdEfGhIjKl"]);
  });
});
