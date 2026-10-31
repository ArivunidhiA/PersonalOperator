import { describe, it, expect } from "vitest";
import { normalizeNumbers } from "@/lib/normalize-numbers";
import { verifyUtterance } from "@/lib/verifier";

describe("normalizeNumbers", () => {
  it.each([
    ["forty percent", "40%"],
    ["He cut costs by forty-five percent.", "He cut costs by 45%."],
    ["one percent", "1%"],
    ["fifty million data points", "50000000 data points"],
    ["twenty five", "25"],
    ["one hundred and twenty", "120"],
    ["a hundred users", "100 users"],
    ["three thousand vehicles", "3000 vehicles"],
    ["two point five percent", "2.5%"],
    ["in twenty twenty five", "in 2025"],
    ["nineteen ninety nine", "1999"],
    ["fifteen minutes", "15 minutes"],
  ])("%s", (i, o) => expect(normalizeNumbers(i)).toBe(o));

  it.each(["two merged fixes", "one of the projects", "He has three repos", "nonetheless, tenant"])("leaves %s alone", (t) =>
    expect(normalizeNumbers(t)).toBe(t),
  );
});

describe("verifier sees spelled numbers", () => {
  it("flags spelled invented numbers via the digit check", () => {
    expect(verifyUtterance("He cut cloud costs by forty percent.").map((v) => v.rule)).toContain("number not in facts");
    expect(verifyUtterance("It served ten thousand drivers.").map((v) => v.rule)).toContain("number not in facts");
  });
  it("allows spelled numbers that are facts", () => {
    expect(verifyUtterance("The chat is fifteen minutes, and he started in twenty twenty three.")).toEqual([]);
    expect(verifyUtterance("He shipped two merged fixes.")).toEqual([]);
  });
});
