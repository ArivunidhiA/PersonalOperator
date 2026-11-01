import { describe, it, expect } from "vitest";
import { fallbackAnalysis, scrubNames } from "@/lib/call-summary";

const said = (text: string) => [{ role: "user" as const, text }];

describe("the summary a caller sees names no company", () => {
  it.each(["Acme", "Northwind", "Goldman Sachs", "Blue Origin"])("removes %s, whatever the name", (name) => {
    const out = scrubNames(`The caller asked if ${name} is a customer, and was told that is confidential.`, said(`Is ${name} a customer?`));
    expect(out).not.toContain(name);
    expect(out).toBe("The caller asked if a company is a customer, and was told that is confidential.");
  });

  it("removes a name that opens a sentence", () => {
    expect(scrubNames("Acme came up. The caller left.", said("I'm calling from Acme"))).toBe("A company came up. The caller left.");
  });

  it("removes a name with a possessive, once for a repeat", () => {
    expect(scrubNames("Asked about Acme's stack and Acme hiring.", said("Acme"))).toBe("Asked about a company's stack and a company hiring.");
  });

  it("removes the company the caller gave, in any case", () => {
    expect(scrubNames("Asked about acme.", said("acme"), ["Acme"])).toBe("Asked about a company.");
  });

  it("keeps his own history, skills, the caller's name and plain words", () => {
    const line = "Sam asked about Hyundai, INZI Controls, Python and AWS on Monday. They booked a chat with Ariv.";
    expect(scrubNames(line, said("I'm Sam, tell me about Python"), [], ["Sam"])).toBe(line);
  });

  it("keeps a common tool his notes don't list", () => {
    const line = "The caller asked about LangGraph and PyTorch.";
    expect(scrubNames(line, said("does he know LangGraph and PyTorch"))).toBe(line);
  });

  it("keeps ordinary openers even when the caller used the word", () => {
    const line = "Asked if he knows Python. Wanted a call.";
    expect(scrubNames(line, said("I asked if he knows Python and wanted a call"))).toBe(line);
  });

  it("also cleans the no-model fallback, which quotes the caller", () => {
    const m = said("Did he work at Acme before this?");
    expect(scrubNames(fallbackAnalysis(m).summary, m)).not.toContain("Acme");
  });
});
