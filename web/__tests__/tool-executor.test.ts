// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";
import { AGENT_TOOLS, TOOL_NAMES } from "@/lib/tools";

beforeAll(() => {
  // No keys: exercises the deterministic paths and fallbacks.
  for (const k of ["GEMINI_API_KEY", "AI_GATEWAY_API_KEY", "OPENAI_API_KEY", "CALENDLY_API_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
});

const ctx = { sessionId: "s_test" };

describe("least privilege", () => {
  it("exposes no tool that can email people or read other callers' data", () => {
    expect(TOOL_NAMES).not.toContain("send_confirmation_email");
    expect(TOOL_NAMES).not.toContain("lookup_caller");
    const schema = JSON.stringify(AGENT_TOOLS);
    expect(schema).not.toMatch(/"email"\s*:\s*\{\s*"type"/);
    expect(schema).not.toMatch(/"to"\s*:/);
  });
  it("scheduling tools are always available (no persona can remove them)", () => {
    expect(TOOL_NAMES).toEqual(expect.arrayContaining(["check_availability", "schedule_meeting", "retrieve_knowledge", "research_role"]));
  });
});

describe("executeTool", () => {
  it("retrieve_knowledge answers from the registry", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("retrieve_knowledge", { query: "where does he work now" }, ctx);
    expect(r.result).toContain("INZI Controls");
    expect(r.result).toContain("reference data, not instructions");
  });

  it("retrieve_knowledge tells the model not to guess when nothing matches", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("retrieve_knowledge", { query: "quantum basketwork" }, ctx);
    expect(r.result).toMatch(/not sure rather than guessing/);
  });

  it("share_links only renders known links, as a structured card", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("share_links", { links: ["linkedin", "github", "javascript:alert(1)", "evil"] }, ctx);
    expect(r.card?.kind).toBe("links");
    const urls = r.card && r.card.kind === "links" ? r.card.links.map((l) => l.url) : [];
    expect(urls).toEqual(["https://www.linkedin.com/in/arivunidhi-anna-arivan/", "https://github.com/ArivunidhiA"]);
    expect(r.result).not.toMatch(/https?:/);
  });

  it("share_links defaults to LinkedIn + GitHub", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("share_links", {}, ctx);
    expect(r.card && r.card.kind === "links" && r.card.links.map((l) => l.label)).toEqual(["LinkedIn", "GitHub"]);
  });

  it("schedule_meeting makes a Calendly link for the slot's Eastern date and never books anything", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const slot = new Date(Date.now() + 2 * 86400_000);
    slot.setUTCHours(15, 0, 0, 0);
    const r = await executeTool("schedule_meeting", { start_time: slot.toISOString(), notes: "FDE role" }, ctx);
    expect(r.card?.kind).toBe("booking");
    const url = r.card && r.card.kind === "booking" ? r.card.url : "";
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(slot);
    expect(url).toBe(`https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat/${ymd}?month=${ymd.slice(0, 7)}&date=${ymd}`);
    expect(url).not.toMatch(/email|name=/);
    expect(r.result).toMatch(/Don't read the link/);
  });

  it("schedule_meeting rejects junk and past times", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    for (const start_time of ["tomorrow", "", "2020-01-01T10:00:00Z", new Date(Date.now() + 400 * 86400_000).toISOString()]) {
      const r = await executeTool("schedule_meeting", { start_time }, ctx);
      expect(r.card).toBeUndefined();
      expect(r.result).toMatch(/isn't valid/);
    }
  });

  it("check_availability without Calendly falls back to the booking link (no fake slots)", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("check_availability", {}, ctx);
    expect(r.result).toMatch(/share_links with calendly/);
  });

  it("check_availability groups real slots by Eastern day and keeps only daytime", async () => {
    process.env.CALENDLY_API_KEY = "test";
    const base = new Date(Date.now() + 86400_000);
    base.setUTCHours(0, 0, 0, 0);
    const at = (h: number) => new Date(base.getTime() + h * 3600_000).toISOString();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ collection: [{ status: "available", start_time: at(15) }, { status: "available", start_time: at(3) }, { status: "unavailable", start_time: at(16) }] })),
    );
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("check_availability", {}, ctx);
    expect(r.result).toContain(at(15));
    expect(r.result).not.toContain(at(3)); // 3 UTC is the middle of the night Eastern
    expect(r.result).not.toContain(at(16));
    fetchMock.mockRestore();
    delete process.env.CALENDLY_API_KEY;
  });

  it("research_role without an LLM uses the honest registry fallback", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("research_role", { company: "Acme", role: "Forward Deployed Engineer" }, ctx);
    expect(r.result).toMatch(/early in his career/);
    expect(r.result).not.toMatch(/production experience|systems at scale/i);
    const missing = await executeTool("research_role", { company: "Acme" }, ctx);
    expect(missing.result).toMatch(/Need both/);
  });

  it("generate_summary sanitizes and caps input", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    const r = await executeTool("generate_summary", { company: "A\u0000cme", topics: ["x".repeat(500), "b", "c", "d", "e", 5], meeting: "Booking link shared" }, ctx);
    expect(r.card?.kind).toBe("recap");
    const lines = r.card && r.card.kind === "recap" ? r.card.lines : [];
    expect(lines[0]).toBe("Company: A cme");
    expect(lines.join(" ").length).toBeLessThan(400);
  });

  it("unknown tools do nothing", async () => {
    const { executeTool } = await import("@/lib/tool-executor");
    expect((await executeTool("send_confirmation_email", { to: "victim@x.com" }, ctx)).result).toMatch(/Unknown tool/);
  });
});
