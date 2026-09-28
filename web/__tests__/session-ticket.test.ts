// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
});

describe("session tickets", () => {
  it("round-trips and carries identity", async () => {
    const { mintTicket, verifyTicket } = await import("@/lib/session-ticket");
    const t = mintTicket({ sid: "s_1", p: "gemini", uid: "user_1", em: "a@b.co" });
    expect(verifyTicket(t)).toMatchObject({ sid: "s_1", p: "gemini", uid: "user_1", em: "a@b.co" });
  });

  it("rejects tampering (e.g. swapping in someone else's email)", async () => {
    const { mintTicket, verifyTicket } = await import("@/lib/session-ticket");
    const [body, mac] = mintTicket({ sid: "s_1", p: "gemini", uid: null, em: null }).split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), em: "victim@x.com" })).toString("base64url");
    expect(verifyTicket(`${forged}.${mac}`)).toBeNull();
    expect(verifyTicket(`${body}.AAAA`)).toBeNull();
    expect(verifyTicket("garbage")).toBeNull();
    expect(verifyTicket("")).toBeNull();
    expect(verifyTicket(null)).toBeNull();
  });

  it("expires", async () => {
    const { mintTicket, verifyTicket } = await import("@/lib/session-ticket");
    const t = mintTicket({ sid: "s_1", p: "gemini", uid: null, em: null }, Date.now() - 60 * 60 * 1000);
    expect(verifyTicket(t)).toBeNull();
  });

  it("reads the header or a body field (sendBeacon)", async () => {
    const { mintTicket, ticketFrom } = await import("@/lib/session-ticket");
    const t = mintTicket({ sid: "s_2", p: "gemini", uid: null, em: null });
    expect(ticketFrom(new Request("http://x", { headers: { "x-session-ticket": t } }))?.sid).toBe("s_2");
    expect(ticketFrom(new Request("http://x"), t)?.sid).toBe("s_2");
    expect(ticketFrom(new Request("http://x"))).toBeNull();
  });

  it("makes unguessable session ids", async () => {
    const { newSessionId } = await import("@/lib/session-ticket");
    const a = newSessionId();
    expect(a).toMatch(/^s_[a-z0-9]+_[A-Za-z0-9_-]{12}$/);
    expect(newSessionId()).not.toBe(a);
  });
});
