import { createHash } from "crypto";
import { describe, it, expect } from "vitest";
import { checkLive, createLiveGuard, guardConfig, sha256 } from "@/lib/live-guard";

const cfg = guardConfig(["AcmeAuto", "widget program"], "salt1");
const rule = (t: string) => checkLive(t, cfg)?.rule ?? null;
const stream = (deltas: string[]) => {
  const g = createLiveGuard(cfg);
  for (const d of deltas) {
    const h = g.push(d);
    if (h) return h;
  }
  return g.flush();
};

describe("sha256", () => {
  it.each(["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(200), "héllo 한국"])("matches node crypto for %j", (t) => {
    expect(sha256(t)).toBe(createHash("sha256").update(t).digest("hex"));
  });
});

describe("guardConfig keeps terms off the client", () => {
  it("sends salted hashes only", () => {
    const json = JSON.stringify(cfg).toLowerCase();
    expect(json).not.toContain("acme");
    expect(json).not.toContain("widget");
    expect(cfg.hashes).toHaveLength(2);
    expect(cfg.maxWords).toBe(2);
  });
  it("differs per call", () => {
    expect(guardConfig(["AcmeAuto"], "salt2").hashes[0]).not.toBe(cfg.hashes[0]);
  });
  it("drops terms under three characters", () => {
    expect(guardConfig(["ab", ""], "s").hashes).toEqual([]);
  });
});

describe("fires on lines that are wrong in any context", () => {
  it.each([
    ["He works on the AcmeAuto account.", "confidential term"],
    ["that WIDGET   program is cool", "confidential term"],
    ["Yeah, I'm a real person.", "claims to be human"],
    ["I'm not an AI, promise.", "claims to be human"],
    ["He was a software engineer at Hyundai.", "claimed title"],
    ["He's a staff engineer.", "claimed title"],
    ["He's AWS certified.", "claimed certification"],
    ["Fair.|  |\n| --- | --- |\n| Topic | Details |", "markdown or planning text"],
    ["Sure. **Clarifying the request** now.", "markdown or planning text"],
    ["Call to action: ask for the role.", "markdown or planning text"],
  ])("%s", (line, want) => {
    expect(rule(line)).toBe(want);
  });
  it("never echoes a confidential term", () => {
    expect(checkLive("He works on the AcmeAuto account.", cfg)?.excerpt).toBe("[redacted]");
  });
});

describe("high precision: a false hit cuts a good reply", () => {
  it.each([
    "He's a Client Project Coordinator at INZI Controls.",
    "Nope, I'm an AI Ariv built.",
    "I'm not a real person, I'm an AI Ariv built.",
    "No certifications, but he's used S3 and Lambda.",
    "He's an engineer at heart.",
    "He's not a software engineer by title, the work was engineering.",
    "He's looking for software engineer roles.",
    "He did real software engineering work at Hyundai.",
    "Is he a software engineer?",
    "acmeautomation is a different thing.",
    "He built a widget and a program.",
    "When the caller is talking, the model stops.",
    "The next step is a quick call with him.",
    "He has 3 ideas and a 15 minute slot on Tuesday at 2 pm.",
    "You can see it on his GitHub.",
  ])("%s", (line) => {
    expect(rule(line)).toBeNull();
  });
});

describe("streaming", () => {
  it("waits for the end of the sentence", () => {
    expect(stream(["He's a soft", "ware engineer", " at heart. Anyway."])).toBeNull();
    expect(stream(["He's a soft", "ware engineer", " at Hyundai. Anyway."])?.rule).toBe("claimed title");
  });
  it("waits for the end of the word", () => {
    expect(stream(["acme", "auto", "mation is fine."])).toBeNull();
    expect(stream(["works with ", "acmeauto", " and more"])?.rule).toBe("confidential term");
  });
  it("finds a term split across deltas and sentences of any length", () => {
    expect(stream(["the widget ", "program is"])?.rule).toBe("confidential term");
  });
  it("flush judges an unfinished last sentence", () => {
    expect(stream(["I'm a real person"])?.rule).toBe("claims to be human");
  });
  it("fires once per turn, and reset arms it again", () => {
    const g = createLiveGuard(cfg);
    expect(g.push("I'm a real person. ")?.rule).toBe("claims to be human");
    expect(g.push("I'm a real person. ")).toBeNull();
    expect(g.flush()).toBeNull();
    g.reset();
    expect(g.push("I'm a real person. ")?.rule).toBe("claims to be human");
  });
  it("works with no config (no terms sent)", () => {
    expect(checkLive("AcmeAuto is great.")).toBeNull();
    expect(checkLive("I'm a human.")?.rule).toBe("claims to be human");
  });
});
