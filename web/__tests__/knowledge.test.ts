import { describe, it, expect } from "vitest";
import { ALLOWED_NUMBERS, FACTS, LINKS, renderFactCard, searchFacts } from "@/lib/knowledge";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { AGENT_TOOLS } from "@/lib/tools";

const allFactText = FACTS.map((f) => f.text).join("\n");

describe("fact registry", () => {
  it("has unique ids and non-trivial entries", () => {
    const ids = FACTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FACTS) {
      expect(f.text.length).toBeGreaterThan(60);
      expect(f.keywords.length).toBeGreaterThan(2);
    }
  });

  it("states the current job correctly", () => {
    const job = FACTS.find((f) => f.id === "current-job")!.text;
    expect(job).toMatch(/INZI Controls.*Client Project Coordinator/);
    expect(job).toContain("June 2026");
    // Ariv, 2026-09-28: coordination is part of the job, not all of it.
    expect(job).toMatch(/isn't the whole job/);
    expect(allFactText).not.toMatch(/not an engineering role/);
  });

  it("leads with his direction: AI engineering, product management, software engineering, building daily", () => {
    const d = FACTS.find((f) => f.id === "direction")!.text;
    expect(d).toMatch(/AI engineering/);
    expect(d).toMatch(/product management/);
    expect(d).toMatch(/software engineering/);
    expect(d).toMatch(/every day/);
    expect(SYSTEM_PROMPT).toMatch(/Never reduce him to "a coordinator"/);
  });

  it("keeps volunteer work framed as volunteer work", () => {
    const v = FACTS.find((f) => f.id === "volunteer")!.text;
    expect(v).toMatch(/volunteer roles, not jobs/);
    expect(allFactText).not.toMatch(/(software engineer|engineer) at (Bright Mind|Crossroads)/i);
  });

  it("contains none of the old inflated or false claims", () => {
    const stale = [/based in Boston/i, /lives in Boston/i, /LLMLab/i, /Job Copilot/i, /1,?000\+? volunteers/i, /12 states/i, /\$90/, /87\.5/, /99\.8/, /40%/, /50M/i, /10,000/, /published research/i, /AWS certified/i, /production systems at scale/i];
    for (const re of stale) expect(allFactText).not.toMatch(re);
  });

  it("says plainly that there is no AWS certification", () => {
    expect(allFactText).toMatch(/no AWS certification/i);
  });

  it("only uses numbers from the allow-list", () => {
    const nums = allFactText.match(/\b\d[\d,.]*\b/g) ?? [];
    for (const n of nums) expect(ALLOWED_NUMBERS, `number ${n} in facts must be allow-listed`).toContain(n.replace(/[.,]$/, ""));
  });

  it("uses no em dashes", () => {
    expect(allFactText).not.toContain("—");
    expect(SYSTEM_PROMPT).not.toContain("—");
  });

  it("has only https links", () => {
    for (const [k, v] of Object.entries(LINKS)) if (k !== "email") expect(v).toMatch(/^https:\/\//);
  });

  it("keeps confidential client names out of every agent-facing text (BANNED_TERMS)", () => {
    const banned = (process.env.BANNED_TERMS || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const everything = `${SYSTEM_PROMPT}\n${JSON.stringify(AGENT_TOOLS)}`.toLowerCase();
    for (const t of banned) expect(everything).not.toContain(t);
  });
});

describe("searchFacts (retrieve_knowledge)", () => {
  const top = (q: string) => searchFacts(q, 1)[0]?.id;
  it.each([
    ["where does he work right now", "current-job"],
    ["what did he do at Hyundai", "hyundai"],
    ["tell me about his open source contributions", "open-source"],
    ["what is forecost", "forecost"],
    ["was bright mind a job", "volunteer"],
    ["does he need visa sponsorship", "limits"],
    ["what's he good at technically", "skills"],
    ["how were you built, which model", "voice-agent"],
  ])("%s -> %s", (q, id) => {
    expect(top(q)).toBe(id);
  });

  it("returns nothing for empty or stop-word queries", () => {
    expect(searchFacts("")).toEqual([]);
    expect(searchFacts("the and of")).toEqual([]);
  });
});

describe("system prompt", () => {
  it("inlines every fact so most answers need no tool call", () => {
    expect(SYSTEM_PROMPT).toContain(renderFactCard());
  });
  it("carries the non-negotiable rules", () => {
    expect(SYSTEM_PROMPT).toMatch(/you're an AI Ariv built/);
    expect(SYSTEM_PROMPT).toMatch(/Never claim to be human/);
    expect(SYSTEM_PROMPT).toMatch(/never name, guess, confirm or deny any INZI Controls customer/);
    expect(SYSTEM_PROMPT).toMatch(/Only say numbers that appear in FACTS/);
    expect(SYSTEM_PROMPT).toMatch(/Never say a URL/);
    expect(SYSTEM_PROMPT).toMatch(/call share_links/);
    expect(SYSTEM_PROMPT).toMatch(/Never ask for the caller's name or email/);
  });
  it("stays compact enough for free-tier token limits", () => {
    // ~4 chars per token; keep the whole prompt under ~5k tokens.
    expect(SYSTEM_PROMPT.length).toBeLessThan(20_000);
  });
});
