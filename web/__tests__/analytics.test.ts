// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: null })), currentUser: vi.fn(async () => null) }));

const recorded: Record<string, unknown>[] = [];
vi.mock("@/lib/analytics-store", async (orig) => {
  const real = await orig<typeof import("@/lib/analytics-store")>();
  return { ...real, recordEvent: vi.fn(async (e: Record<string, unknown>) => void recorded.push(e)) };
});

beforeAll(() => {
  process.env.SESSION_SECRET = "analytics-test-secret-analytics-test-1";
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "IPINFO_TOKEN"]) delete process.env[k];
});

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("visitor context", () => {
  it("reads device, browser and OS from the user agent", async () => {
    const { parseUserAgent } = await import("@/lib/visitor");
    expect(parseUserAgent(IPHONE)).toEqual({ device: "mobile", browser: "Safari", os: "iOS", bot: false });
    expect(parseUserAgent(MAC_CHROME)).toEqual({ device: "desktop", browser: "Chrome", os: "macOS", bot: false });
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0").browser).toBe("Edge");
    expect(parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36").device).toBe("tablet");
  });

  it("flags crawlers, scripts and headless browsers (our own E2E runs) as bots", async () => {
    const { parseUserAgent } = await import("@/lib/visitor");
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1)", "LinkedInBot/1.0", "curl/8.4.0", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36", "node", ""]) {
      expect(parseUserAgent(ua).bot, ua).toBe(true);
    }
  });

  it("decodes Vercel's location headers", async () => {
    const { requestContext } = await import("@/lib/visitor");
    const req = new Request("http://x/", { headers: { "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "San%20Francisco", "user-agent": IPHONE } });
    expect(requestContext(req)).toMatchObject({ country: "US", region: "CA", city: "San Francisco", device: "mobile", bot: false });
  });

  it("labels networks: consumer ISPs and VPNs aren't mistaken for employers", async () => {
    const { networkKind } = await import("@/lib/visitor");
    expect(networkKind("Comcast Cable Communications, LLC")).toBe("isp");
    expect(networkKind("T-Mobile USA, Inc.")).toBe("isp");
    expect(networkKind("Zscaler, Inc.")).toBe("hosting");
    expect(networkKind("Stripe, Inc.")).toBe("org");
    // F-04: small regional ISPs (production smoke: "Troy Cablevision, Inc.") are ISPs, not employers.
    expect(networkKind("Troy Cablevision, Inc.")).toBe("isp");
    expect(networkKind("Point Broadband Fiber Holding, LLC")).toBe("isp");
    expect(networkKind("Farmers Telephone Cooperative, Inc.")).toBe("isp");
    expect(networkKind("Rise Broadband")).toBe("isp");
  });

  it("never looks up private or missing IPs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { lookupNetwork } = await import("@/lib/visitor");
    expect(await lookupNetwork("10.1.2.3")).toBeNull();
    expect(await lookupNetwork(null)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("booking links", () => {
  it("carry UTM tags so Calendly can tie a booking to the call or visit", async () => {
    const { tagBookingUrl, LINKS } = await import("@/lib/knowledge");
    expect(tagBookingUrl(LINKS.calendly, "s_abc_123")).toBe(`${LINKS.calendly}?utm_source=arivsai&utm_medium=voice_agent&utm_content=s_abc_123`);
    expect(tagBookingUrl(LINKS.calendly)).toBe(`${LINKS.calendly}?utm_source=arivsai&utm_medium=voice_agent`);
  });
});

describe("session tickets carry the analytics visitor id", () => {
  it("round-trips vid and the owner flag", async () => {
    const { mintTicket, verifyTicket } = await import("@/lib/session-ticket");
    const t = verifyTicket(mintTicket({ sid: "s_1", p: "gemini", uid: null, em: null, vid: "v_0123456789abcdef", own: true }));
    expect(t?.vid).toBe("v_0123456789abcdef");
    expect(t?.own).toBe(true);
  });
});

const track = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "user-agent": MAC_CHROME, "x-real-ip": "10.0.0.7", host: "arivsai.app", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function lastEvent(): Promise<Record<string, unknown>> {
  await vi.waitFor(() => expect(recorded.length).toBeGreaterThan(0));
  return recorded.pop()!;
}

describe("/api/track", () => {
  it("rejects cross-site posts, junk and oversized bodies", async () => {
    const { POST } = await import("@/app/api/track/route");
    expect((await POST(track({ t: "visit" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(track("not json"))).status).toBe(400);
    expect((await POST(track({ t: "purchase" }))).status).toBe(400);
    expect((await POST(track({ t: "visit", pad: "x".repeat(5000) }))).status).toBe(413);
  });

  it("records a visit with location, source and device, and strips query strings from the referrer", async () => {
    const { POST } = await import("@/app/api/track/route");
    const res = await POST(
      track(
        { t: "visit", vid: "v_0123456789abcdef", path: "/", ref: "https://www.linkedin.com/feed/?trk=secret-token", utm: { source: "linkedin", medium: "social", evil: "x" }, tz: "America/Chicago", lang: "en-US" },
        { "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "TX", "x-vercel-ip-city": "Austin" },
      ),
    );
    expect(await res.json()).toEqual({ ok: true, persist: true });
    const e = await lastEvent();
    expect(e).toMatchObject({ type: "visit", visitor_id: "v_0123456789abcdef", path: "/", referrer: "www.linkedin.com/feed/", utm: { source: "linkedin", medium: "social" }, country: "US", region: "TX", city: "Austin", timezone: "America/Chicago", device: "desktop", browser: "Chrome", os: "macOS", is_bot: false, is_owner: false });
    expect(JSON.stringify(e)).not.toContain("secret-token");
  });

  it("keeps EEA/UK/CH visitors anonymous and tells the browser not to store an id", async () => {
    const { POST } = await import("@/app/api/track/route");
    const res = await POST(track({ t: "visit", vid: "v_0123456789abcdef", path: "/" }, { "x-vercel-ip-country": "DE", "x-vercel-ip-city": "Berlin" }));
    expect(await res.json()).toEqual({ ok: true, persist: false });
    const e = await lastEvent();
    expect(e).toMatchObject({ visitor_id: null, city: null, region: null, country: "DE" });
  });

  it("records link clicks with the link's host, and drops malformed ids", async () => {
    const { POST } = await import("@/app/api/track/route");
    await POST(track({ t: "click", vid: "not-a-vid", sid: "s_mzx1a2b_AbCdEfGhIjKl", label: "Book a 15-min chat", href: "https://calendly.com/x?utm_content=s_1", path: "/" }, { "x-vercel-ip-country": "US" }));
    const e = await lastEvent();
    expect(e).toMatchObject({ type: "click", visitor_id: null, session_id: "s_mzx1a2b_AbCdEfGhIjKl", label: "Book a 15-min chat", target: "calendly.com" });
    await POST(track({ t: "click", label: "Email", href: "mailto:someone@example.com" }, { "x-vercel-ip-country": "US" }));
    expect((await lastEvent()).target).toBe("email");
  });

  it("flags headless browsers and honours the owner hint", async () => {
    const { POST } = await import("@/app/api/track/route");
    await POST(track({ t: "visit", own: true }, { "user-agent": "Mozilla/5.0 HeadlessChrome/140.0", "x-vercel-ip-country": "US" }));
    expect(await lastEvent()).toMatchObject({ is_bot: true, is_owner: true });
  });
});

describe("dashboard report", () => {
  const now = new Date("2026-09-29T18:00:00Z");
  const ev = (o: Partial<import("@/lib/analytics-report").EventRow>) => ({
    created_at: "2026-09-29T12:00:00Z", type: "visit", visitor_id: null, session_id: null, label: null, referrer: null, utm: null,
    country: "US", region: "WA", city: "Seattle", device: "desktop", browser: "Chrome", os: "macOS",
    network_org: null, network_domain: null, network_host: null, network_kind: null, is_owner: false, is_bot: false, ...o,
  });
  const call = (o: Partial<import("@/lib/analytics-report").CallRow>) => ({
    id: "c1", session_id: "s_a", created_at: "2026-09-29T12:05:00Z", caller_name: null, caller_email: null, intent: "recruiter", summary: "Asked about forecost.",
    topics: ["forecost"], outcome: "info_provided", company: null, share_token: null, ...o,
  });

  it("builds one card per visitor with where they came from, what they said, clicked and booked", async () => {
    const { buildReport } = await import("@/lib/analytics-report");
    const r = buildReport({
      now,
      days: 30,
      includeAll: false,
      events: [
        ev({ visitor_id: "v_1", referrer: "www.linkedin.com/feed/", network_org: "Stripe, Inc.", network_kind: "org", created_at: "2026-09-28T10:00:00Z" }),
        ev({ visitor_id: "v_1" }),
        ev({ type: "call_start", visitor_id: "v_1", session_id: "s_a" }),
        ev({ type: "click", visitor_id: "v_1", session_id: "s_a", label: "Book a 15-min chat" }),
        ev({ visitor_id: "v_me", is_owner: true }),
        ev({ visitor_id: "v_bot", is_bot: true }),
      ],
      calls: [
        call({ visitor_id: "v_1", caller_name: "Sam", caller_role: "recruiter", company: "Stripe", questions: ["What's he building?", "Can I book him?"], duration_s: 200 }),
        call({ id: "c0", session_id: "s_old", created_at: "2026-09-20T12:00:00Z", summary: "Old call before analytics." }),
      ],
      bookings: [
        { name: "Sam Lee", email: "sam@stripe.com", bookedAt: "2026-09-29T12:10:00Z", startTime: "2026-10-01T15:00:00Z", status: "active", event: "15 Min Coffee Chat", utmSource: "arivsai", ref: "s_a" },
        { name: "Pat", email: "pat@x.io", bookedAt: "2026-09-25T12:00:00Z", startTime: "2026-09-26T15:00:00Z", status: "active", event: "15 Min Coffee Chat", utmSource: null, ref: null },
      ],
    });
    const v1 = r.visitors.find((v) => v.id === "v_1")!;
    expect(v1).toMatchObject({ visits: 2, source: "www.linkedin.com", location: "Seattle, WA, US", clicks: ["Book a 15-min chat"] });
    expect(v1.network?.org).toBe("Stripe, Inc.");
    expect(v1.identity).toMatchObject({ name: "Sam", role: "recruiter", company: "Stripe", email: "sam@stripe.com", via: ["said on the call", "booked on Calendly"] });
    expect(v1.booking?.email).toBe("sam@stripe.com");
    expect(v1.calls[0].questions).toEqual(["What's he building?", "Can I book him?"]);
    // Calls from before this release still show up, on their own card.
    expect(r.visitors.some((v) => v.id === "call:s_old")).toBe(true);
    // Ariv's own visits and bots are hidden by default.
    expect(r.visitors.some((v) => v.id === "v_me" || v.id === "v_bot")).toBe(false);
    expect(r.meta).toMatchObject({ excludedOwner: 1, excludedBots: 1 });
    expect(r.overview).toMatchObject({ visits: 2, calls: 2, identified: 1, bookingClicks: 1, bookings: 2, returning: 1, avgCallSeconds: 200 });
    expect(r.bookings.map((b) => b.matched)).toEqual([true, false]);
    expect(r.recentQuestions[0]).toMatchObject({ who: "Sam, recruiter, Stripe", where: null });
    expect(r.daily.at(-1)).toEqual({ date: "2026-09-29", visits: 1, calls: 1 });
  });

  it("re-labels networks when reading, so rows stored before the F-04 fix show the right kind", async () => {
    const { buildReport } = await import("@/lib/analytics-report");
    const r = buildReport({ now, days: 7, includeAll: false, bookings: null, calls: [], events: [ev({ visitor_id: "v_home", network_org: "Troy Cablevision, Inc.", network_kind: "org" })] });
    expect(r.visitors[0].network?.kind).toBe("isp");
    expect(r.networks[0]).toMatchObject({ name: "Troy Cablevision, Inc.", kind: "isp" });
  });

  it("shows everything when asked to include owner and test traffic", async () => {
    const { buildReport } = await import("@/lib/analytics-report");
    const r = buildReport({ now, days: 7, includeAll: true, bookings: null, calls: [], events: [ev({ visitor_id: "v_me", is_owner: true }), ev({ visitor_id: "v_bot", is_bot: true })] });
    expect(r.visitors.map((v) => v.id).sort()).toEqual(["v_bot", "v_me"]);
    expect(r.visitors.find((v) => v.id === "v_me")?.owner).toBe(true);
  });
});
