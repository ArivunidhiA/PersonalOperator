import { describe, it, expect, afterEach } from "vitest";
import { verifyUtterance } from "@/lib/verifier";

const rules = (t: string) => verifyUtterance(t).map((v) => v.rule);

describe("verifier catches what the old agent actually told real callers", () => {
  // Lines taken from stored production transcripts (Mar-Apr 2026).
  it.each([
    ["Yeah, right now he's working as an engineer at Bright Mind Enrichment.", "volunteer called a job"],
    ["He's in Boston, did his Master's in Business Analytics from Northeastern.", "wrong location"],
    ["He built a telemetry service handling over 50 million data points a day.", "number not in facts"],
    ["from more than 10,000 vehicles", "number not in facts"],
    ["Ha, I just work with Ariv. What do you wanna know?", "claims to be human"],
    ["LLMLab has sub-45 millisecond response times", "old project"],
    ["You can find it at github.com slash ArivunidhiA", "URL spoken"],
    ["He's AWS certified, yeah.", "certification claim"],
    ["He was a software engineer at Serotonin.", "software engineer title"],
    ["I'm a real person, promise.", "claims to be human"],
    ["He's great — really.", "em dash"],
  ])("%s", (line, rule) => {
    expect(rules(line)).toContain(rule);
  });
});

describe("verifier passes honest answers", () => {
  it.each([
    "He's a Client Project Coordinator at INZI Controls, started in June 2026.",
    "Nope, I'm an AI Ariv built. What do you wanna know about him?",
    "He tested it on 601 of his own agent turns and the range was too wide.",
    "He's got time Tuesday at 2 pm and Wednesday at 10:30 am.",
    "He has no AWS certification, but he's used S3 and Lambda.",
    "He's not a software engineer by title, his experience is internships.",
    "Two merged fixes in Agno and three docs fixes in PyTorch AO.",
    "I dropped his LinkedIn and GitHub in the chat.",
  ])("%s", (line) => {
    expect(verifyUtterance(line)).toEqual([]);
  });
});

describe("confidential terms come from env, not the repo", () => {
  afterEach(() => {
    delete process.env.BANNED_TERMS;
  });
  it("flags configured terms as whole words, case-insensitive", () => {
    process.env.BANNED_TERMS = "acmeauto,widget program";
    expect(rules("He works on the AcmeAuto account")).toContain("confidential term");
    expect(rules("that widget program is cool")).toContain("confidential term");
    expect(rules("acmeautomation is different")).not.toContain("confidential term");
  });
});
