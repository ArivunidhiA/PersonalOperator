// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildReport } from "@/lib/analytics-report";

// Node's own (empty) localStorage global shadows jsdom's here, so install a small in-memory one.
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
for (const target of [globalThis, window]) Object.defineProperty(target, "localStorage", { configurable: true, value: storage });

// Recharts measures its container; jsdom has no layout.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const report = buildReport({
  now: new Date(),
  days: 30,
  includeAll: false,
  events: [
    {
      created_at: new Date(Date.now() - 3600_000).toISOString(), type: "visit", visitor_id: "v_1", session_id: null, label: null, referrer: "www.linkedin.com/feed/", utm: null,
      country: "US", region: "WA", city: "Seattle", device: "desktop", browser: "Chrome", os: "macOS",
      network_org: "Stripe, Inc.", network_domain: "stripe.com", network_host: null, network_kind: "org", is_owner: false, is_bot: false,
    },
    {
      created_at: new Date(Date.now() - 3000_000).toISOString(), type: "click", visitor_id: "v_1", session_id: "s_a", label: "Book a 15-min chat", referrer: null, utm: null,
      country: "US", region: "WA", city: "Seattle", device: "desktop", browser: "Chrome", os: "macOS",
      network_org: null, network_domain: null, network_host: null, network_kind: null, is_owner: false, is_bot: false,
    },
  ],
  calls: [
    {
      id: "c1", session_id: "s_a", created_at: new Date(Date.now() - 3300_000).toISOString(), caller_name: "Sam", caller_email: null, intent: "recruiter",
      summary: "Asked what he's building and booked a chat.", topics: ["forecost"], outcome: "booking_link_shared", company: "Stripe", share_token: null,
      visitor_id: "v_1", caller_role: "recruiter", hiring_for: "forward deployed engineer", questions: ["What's he building right now?"], duration_s: 245, context: null,
    },
  ],
  bookings: [],
});

const serve = (status: number, body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("owner dashboard", () => {
  it("shows who visited: what they said, where from, how they found the site, what they clicked", async () => {
    serve(200, { ...report, meta: { ...report.meta, migrationPending: false, bookingsAvailable: true } });
    const { default: Page } = await import("@/app/dashboard/page");
    render(<Page />);
    expect(await screen.findByText(/Who's been here \(1\)/)).toBeTruthy();
    expect(screen.getByText("Sam, recruiter, Stripe")).toBeTruthy();
    // On the visitor card and again in the Locations / Came from panels.
    expect(screen.getAllByText("Seattle, WA, US").length).toBe(2);
    expect(screen.getAllByText("www.linkedin.com").length).toBe(2);
    expect(screen.getByText(/possibly their company/)).toBeTruthy();
    expect(screen.getByText("Book a 15-min chat")).toBeTruthy();
    expect(screen.getAllByText("What's he building right now?").length).toBeGreaterThan(0);
    expect(screen.getByText(/hiring for forward deployed engineer/)).toBeTruthy();
    // Opening the dashboard marks this browser as Ariv's, so his own visits stay out of the numbers.
    expect(window.localStorage.getItem("ariv-owner")).toBe("1");
  });

  it("tells Ariv when the database update hasn't run", async () => {
    serve(200, { ...report, meta: { ...report.meta, migrationPending: true, bookingsAvailable: false } });
    const { default: Page } = await import("@/app/dashboard/page");
    render(<Page />);
    expect(await screen.findByText(/one-time database update/)).toBeTruthy();
    expect(screen.getByText(/Couldn't reach Calendly/)).toBeTruthy();
  });

  it("shows access errors instead of data", async () => {
    serve(403, { error: "Forbidden" });
    const { default: Page } = await import("@/app/dashboard/page");
    render(<Page />);
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(window.localStorage.getItem("ariv-owner")).toBeNull();
  });
});
