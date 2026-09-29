// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { AGENT_MODES, detectAgentTransition } from "@/lib/agents";
import { TOOL_NAMES } from "@/lib/tools";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["GEMINI_API_KEY", "OPENAI_API_KEY", "VOICE_FALLBACK", "VOICE_PROVIDER"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("voice provider choice", () => {
  it("uses free Gemini by default", async () => {
    process.env.GEMINI_API_KEY = "k";
    delete process.env.VOICE_FALLBACK;
    const { chooseProvider } = await import("@/lib/voice-config");
    expect(chooseProvider("US")).toBe("gemini");
    expect(chooseProvider(null)).toBe("gemini");
  });

  it("never serves EEA/UK/CH visitors from the Gemini free tier", async () => {
    process.env.GEMINI_API_KEY = "k";
    delete process.env.VOICE_FALLBACK;
    const { chooseProvider, geminiAllowedIn } = await import("@/lib/voice-config");
    for (const c of ["DE", "PT", "RO", "LT", "GB", "CH", "fr"]) {
      expect(geminiAllowedIn(c)).toBe(false);
      expect(chooseProvider(c)).toBeNull();
    }
  });

  it("uses the paid OpenAI fallback only when explicitly enabled", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.OPENAI_API_KEY = "k";
    const { chooseProvider } = await import("@/lib/voice-config");
    delete process.env.VOICE_FALLBACK;
    expect(chooseProvider("DE")).toBeNull();
    process.env.VOICE_FALLBACK = "openai";
    expect(chooseProvider("DE")).toBe("openai");
    expect(chooseProvider("US")).toBe("gemini");
  });

  it("returns null when nothing is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { chooseProvider } = await import("@/lib/voice-config");
    expect(chooseProvider("US")).toBeNull();
  });
});

describe("session configs", () => {
  it("Gemini: prompt + all tools locked in, fact tools blocking, recap non-blocking", async () => {
    const { buildGeminiLiveConfig } = await import("@/lib/voice-config");
    const { SYSTEM_PROMPT } = await import("@/lib/system-prompt");
    const cfg = buildGeminiLiveConfig();
    expect(cfg.systemInstruction.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(cfg.systemInstruction).toMatch(/TODAY\nToday is \w+day, /); // the model is told the date
    const decls = cfg.tools[0].functionDeclarations;
    expect(decls.map((d) => d.name)).toEqual(TOOL_NAMES);
    expect(decls.find((d) => d.name === "retrieve_knowledge")!.behavior).toBe("BLOCKING");
    expect(decls.find((d) => d.name === "generate_summary")!.behavior).toBe("NON_BLOCKING");
    expect(cfg.inputAudioTranscription).toEqual({});
    expect(cfg.outputAudioTranscription).toEqual({});
    expect(cfg).not.toHaveProperty("enableAffectiveDialog"); // removed in 3.8 Live
  });

  it("OpenAI fallback: GA session shape on a non-deprecated model", async () => {
    const { buildOpenAISession } = await import("@/lib/voice-config");
    const s = buildOpenAISession();
    expect(s.type).toBe("realtime");
    expect(s.model).not.toBe("gpt-realtime"); // shuts down 2027-01-20
    expect(s.tools.map((t) => t.name)).toEqual(TOOL_NAMES);
  });
});

describe("call modes", () => {
  it("has the four modes and valid triggers", () => {
    expect(AGENT_MODES.map((m) => m.id)).toEqual(["greeter", "researcher", "scheduler", "closer"]);
    for (const m of AGENT_MODES) for (const t of m.triggers) expect(TOOL_NAMES).toContain(t);
  });
  it.each([
    ["greeter", "research_role", "researcher"],
    ["researcher", "check_availability", "scheduler"],
    ["scheduler", "generate_summary", "closer"],
    ["researcher", "research_role", null],
    ["greeter", "retrieve_knowledge", null],
  ])("%s + %s -> %s", (from, tool, to) => {
    expect(detectAgentTransition(from, tool)?.id ?? null).toBe(to);
  });
});
