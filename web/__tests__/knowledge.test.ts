import { describe, it, expect } from "vitest";
import { ALLOWED_NUMBERS, FACTS, LINKS, renderFactCard, searchFacts } from "@/lib/knowledge";
import { LINE_POOLS, SYSTEM_PROMPT, buildSystemPrompt, sampleLines } from "@/lib/system-prompt";
import { verifyUtterance } from "@/lib/verifier";
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
    // Ariv, 2026-09-28: the work is basically forward-deployed (bridging companies), minus building their software.
    expect(job).toMatch(/basically forward-deployed/);
    expect(job).toMatch(/bridge between INZI and the other companies/);
    expect(job).toMatch(/doesn't go into the other company to build or fix their software/);
    expect(allFactText).not.toMatch(/not an engineering role/);
  });

  it("leads with his direction: AI engineering, product management, software engineering, building daily", () => {
    const d = FACTS.find((f) => f.id === "direction")!.text;
    expect(d).toMatch(/AI engineering/);
    expect(d).toMatch(/product management/);
    expect(d).toMatch(/software engineering/);
    expect(d).toMatch(/every day/);
    expect(SYSTEM_PROMPT).toMatch(/never reduce him to "a coordinator"/i);
    expect(SYSTEM_PROMPT).toMatch(/Don't claim his title is forward-deployed engineer/);
  });

  it("keeps volunteer work framed as volunteer work", () => {
    const v = FACTS.find((f) => f.id === "volunteer")!.text;
    expect(v).toMatch(/volunteer roles, not jobs/);
    expect(allFactText).not.toMatch(/(software engineer|engineer) at (Bright Mind|Crossroads)/i);
  });

  it("contains none of the old inflated or false claims", () => {
    const stale = [/based in Boston/i, /lives in Boston/i, /LLMLab/i, /Job Copilot/i, /1,?000\+? volunteers/i, /12 states/i, /\$90/, /87\.5/, /99\.8/, /40%/, /50M/i, /10,000/, /published research/i, /AWS certified/i, /production systems at scale/i];
    // The 2026-09-29 answer sheet re-introduced resume metrics Ariv had asked to drop; they stay out.
    stale.push(/12,?000/, /50 million/i, /data points a day/i, /80\+? model/i, /95\+? tests/i, /thousands of (?:volunteer )?assignments/i, /only engineer/i, /multiple states/i, /(?:30|thirty) seconds/i, /computer.vision/i);
    for (const re of stale) expect(allFactText).not.toMatch(re);
  });

  it("says plainly that there is no AWS certification, for a direct question", () => {
    expect(FACTS.find((f) => f.id === "credentials")!.text).toMatch(/no AWS certification/i);
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
    ["how do you handle barge in and echo", "voice-audio"],
    ["is there RAG behind you, how does retrieval work", "voice-retrieval"],
    ["what is your latency", "voice-latency"],
    ["how many turns did he test the forecost prediction on", "forecost-honest"],
    ["tell me about the for cost thing", "forecost"],
    ["what does mal bit do", "current-projects"],
    ["does he have any certifications", "credentials"],
    ["has he held a software engineer title", "credentials"],
    ["how many years of experience does he have", "experience"],
    ["what languages does he speak", "languages"],
    ["what's the hardest bug in forecost", "forecost-depth"],
    ["walk me through the agno bug", "agno-depth"],
    ["what kind of team does he want", "team"],
    ["does he know rust", "skills"],
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
    // Ariv, 2026-09-29: the agent may ask once who it's talking to, but never for contact details.
    expect(SYSTEM_PROMPT).toMatch(/Never ask for an email address or phone number/);
    expect(SYSTEM_PROMPT).toMatch(/If they'd rather not say, drop it/);
    expect(SYSTEM_PROMPT).toMatch(/No fake urgency, no invented competing offers/);
    expect(SYSTEM_PROMPT).toMatch(/never say he's the best candidate/);
  });
  it("stays compact enough for free-tier token limits", () => {
    // ~4 chars per token; keep the whole prompt under ~5k tokens, sample lines included.
    expect(buildSystemPrompt().length).toBeLessThan(20_000);
  });
  it("keeps gaps and instructions out of the card (2026-10-31 owner decisions)", () => {
    const card = renderFactCard();
    expect(card).not.toMatch(/certif/i);
    expect(card).not.toMatch(/early in his career/i);
    expect(card).not.toMatch(/software engineer title/i);
    expect(allFactText).not.toMatch(/don't invent|say you don't think|honest answer is/i);
    expect(allFactText.replace(FACTS.find((f) => f.id === "experience")!.text, "")).not.toMatch(/early in his career/i);
  });
  it("says Hyundai was real software engineering work, without claiming the title", () => {
    const h = FACTS.find((f) => f.id === "hyundai")!;
    expect(h.card).toMatch(/real software engineering work/);
    expect(verifyUtterance(h.card!)).toEqual([]);
  });
  it("names the facts that keep every fact in reach of the lookup", () => {
    expect(FACTS.filter((f) => !f.card).map((f) => f.id)).toEqual(expect.arrayContaining(["credentials", "experience", "voice-audio"]));
  });
});

describe("per-call sample lines", () => {
  const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  it("draws a different set per call", () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => sampleLines(seeded(i + 1))));
    expect(seen.size).toBe(20);
  });
  it("shows each call only part of each pool", () => {
    for (const { take, lines } of Object.values(LINE_POOLS)) {
      expect(lines.length).toBeGreaterThan(take);
      const shown = sampleLines();
      expect(lines.filter((l) => shown.includes(l)).length).toBe(take);
    }
  });
  it("keeps every line out of the fixed prompt", () => {
    for (const { lines } of Object.values(LINE_POOLS)) for (const l of lines) expect(SYSTEM_PROMPT).not.toContain(l);
  });
  it("every line passes the fact check and dodges the old tics", () => {
    for (const { lines } of Object.values(LINE_POOLS)) {
      for (const l of lines) {
        expect(verifyUtterance(l), l).toEqual([]);
        expect(l).not.toMatch(/first ai in history|existential freedom|nice try|^fair\b/i);
        expect(l).not.toContain("—");
      }
    }
  });
});
