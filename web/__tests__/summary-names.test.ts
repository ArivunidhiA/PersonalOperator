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

  it("never quotes the caller in the no-model fallback", () => {
    expect(fallbackAnalysis(said("did he work at acme before this?")).summary).toBe("Caller asked a question.");
  });

  it("keeps his employer even when logged as the caller's company", () => {
    const line = "Asked about his work at INZI Controls.";
    expect(scrubNames(line, said("what about INZI Controls"), ["INZI Controls"])).toBe(line);
  });

  it("keeps times, cities and greetings", () => {
    const line = "Hi. Wants a call at nine AM in Chicago.";
    expect(scrubNames(line, said("Hi, nine AM in Chicago"))).toBe(line);
  });

  it("does not stack an article on the replacement", () => {
    expect(scrubNames("A Acme line.", said("Acme"))).toBe("A company line.");
  });
});
