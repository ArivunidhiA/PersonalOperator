import { describe, it, expect } from "vitest";
import { checkLive, createLiveGuard } from "@/lib/live-guard";

const rule = (t: string) => checkLive(t)?.rule ?? null;
const stream = (deltas: string[]) => {
  const g = createLiveGuard();
  for (const d of deltas) {
    const h = g.push(d);
    if (h) return h;
  }
  return g.flush();
};

describe("fires on lines that are wrong in any context", () => {
  it.each([
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
  it("flush judges an unfinished last sentence", () => {
    expect(stream(["I'm a real person"])?.rule).toBe("claims to be human");
  });
  it("fires once per turn, and reset arms it again", () => {
    const g = createLiveGuard();
    expect(g.push("I'm a real person. ")?.rule).toBe("claims to be human");
    expect(g.push("I'm a real person. ")).toBeNull();
    expect(g.flush()).toBeNull();
    g.reset();
    expect(g.push("I'm a real person. ")?.rule).toBe("claims to be human");
  });
});
