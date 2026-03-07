import { describe, it, expect } from "vitest";
import { AGENT_PERSONAS, detectAgentTransition, getAgentTools, buildSessionUpdate } from "../lib/agents";
import { REALTIME_TOOLS } from "../lib/realtime-tools";

describe("Multi-Agent System", () => {
  describe("Agent Personas", () => {
    it("should have 4 agent personas defined", () => {
      expect(AGENT_PERSONAS).toHaveLength(4);
      expect(AGENT_PERSONAS.map((a) => a.id)).toEqual([
        "greeter", "researcher", "scheduler", "closer",
      ]);
    });

    it("each persona should have non-empty instructions", () => {
      for (const persona of AGENT_PERSONAS) {
        expect(persona.instructions.length).toBeGreaterThan(100);
      }
    });

    it("each persona should reference valid tool names", () => {
      const validNames = REALTIME_TOOLS.map((t) => t.name);
      for (const persona of AGENT_PERSONAS) {
        for (const toolName of persona.toolNames) {
          expect(validNames).toContain(toolName);
        }
      }
    });

    it("greeter should have no triggers (default agent)", () => {
      const greeter = AGENT_PERSONAS.find((a) => a.id === "greeter");
      expect(greeter?.triggers).toEqual([]);
    });
  });

  describe("Agent Transitions", () => {
    it("should transition from greeter to researcher on research_role", () => {
      const next = detectAgentTransition("greeter", "research_role");
      expect(next).not.toBeNull();
      expect(next?.id).toBe("researcher");
    });

    it("should transition from greeter to scheduler on check_availability", () => {
      const next = detectAgentTransition("greeter", "check_availability");
      expect(next).not.toBeNull();
      expect(next?.id).toBe("scheduler");
    });

    it("should transition from researcher to scheduler on schedule_meeting", () => {
      const next = detectAgentTransition("researcher", "schedule_meeting");
      expect(next).not.toBeNull();
      expect(next?.id).toBe("scheduler");
    });

    it("should transition to closer on generate_summary", () => {
      const next = detectAgentTransition("greeter", "generate_summary");
      expect(next).not.toBeNull();
      expect(next?.id).toBe("closer");
    });

    it("should not transition if tool belongs to current agent", () => {
      const next = detectAgentTransition("researcher", "research_role");
      expect(next).toBeNull();
    });

    it("should not transition for retrieve_knowledge (shared tool)", () => {
      const next = detectAgentTransition("greeter", "retrieve_knowledge");
      expect(next).toBeNull();
    });
  });

  describe("Tool Selection", () => {
    it("greeter should have knowledge + memory + research tools", () => {
      const greeter = AGENT_PERSONAS.find((a) => a.id === "greeter")!;
      const tools = getAgentTools(greeter);
      expect(tools.map((t) => t.name)).toEqual(
        expect.arrayContaining(["retrieve_knowledge", "lookup_caller", "research_role"]),
      );
    });

    it("scheduler should have scheduling tools", () => {
      const scheduler = AGENT_PERSONAS.find((a) => a.id === "scheduler")!;
      const tools = getAgentTools(scheduler);
      expect(tools.map((t) => t.name)).toEqual(
        expect.arrayContaining(["check_availability", "schedule_meeting"]),
      );
    });

    it("closer should only have generate_summary", () => {
      const closer = AGENT_PERSONAS.find((a) => a.id === "closer")!;
      const tools = getAgentTools(closer);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("generate_summary");
    });
  });

  describe("Session Update Building", () => {
    it("should build valid session update payload", () => {
      const greeter = AGENT_PERSONAS.find((a) => a.id === "greeter")!;
      const update = buildSessionUpdate(greeter);
      expect(update.type).toBe("session.update");
      expect(update.session.instructions).toBeTruthy();
      expect(update.session.tools.length).toBeGreaterThan(0);
      expect(update.session.tool_choice).toBe("auto");
    });

    it("should append caller context to instructions", () => {
      const greeter = AGENT_PERSONAS.find((a) => a.id === "greeter")!;
      const ctx = "\n\nCALLER INFO: John from Strada";
      const update = buildSessionUpdate(greeter, ctx);
      expect(update.session.instructions).toContain("John from Strada");
    });
  });
});

describe("Prompt Quality Checks", () => {
  const allInstructions = AGENT_PERSONAS.map((a) => a.instructions).join("\n\n");

  it("should never contain resume-speak patterns (outside of negative examples)", () => {
    const badPatterns = [
      "leveraged",
      "utilized",
      "spearheaded",
    ];
    for (const pattern of badPatterns) {
      expect(allInstructions.toLowerCase()).not.toContain(pattern);
    }
  });

  it("should enforce response length limits", () => {
    expect(allInstructions).toContain("3 to 5 sentences MAX");
  });

  it("should have URL handling rules", () => {
    expect(allInstructions).toContain("NEVER read a URL");
  });

  it("should have the AI deflection rule", () => {
    expect(allInstructions).toContain("You are NOT an AI");
  });

  it("should enforce no dead air during tool calls", () => {
    expect(allInstructions).toContain("MUST speak BEFORE");
  });

  it("should prohibit 'anything else' questions", () => {
    expect(allInstructions).toContain("NEVER ask");
    expect(allInstructions.toLowerCase()).toContain("anything else");
  });
});

describe("Tool Definitions Quality", () => {
  it("all tools should have descriptions", () => {
    for (const tool of REALTIME_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("all tools should have valid parameter schemas", () => {
    for (const tool of REALTIME_TOOLS) {
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.properties).toBeDefined();
    }
  });

  it("research_role should require both company and role", () => {
    const tool = REALTIME_TOOLS.find((t) => t.name === "research_role");
    expect(tool?.parameters.required).toEqual(["company", "role"]);
  });

  it("schedule_meeting should require start_time, name, email", () => {
    const tool = REALTIME_TOOLS.find((t) => t.name === "schedule_meeting");
    expect(tool?.parameters.required).toEqual(
      expect.arrayContaining(["start_time", "name", "email"]),
    );
  });
});

describe("Tool Executor Contract", () => {
  it("generate_summary should return UI message", async () => {
    const { executeTool } = await import("../lib/tool-executor");
    const { result, uiMessage } = await executeTool("generate_summary", {
      company: "Strada",
      role: "FDE",
      status: "Strong Fit",
      meeting: "Scheduled",
    });

    expect(result).toContain("Do NOT read");
    expect(uiMessage).toBeDefined();
    expect(uiMessage!.text).toContain("Strada");
    expect(uiMessage!.text).toContain("FDE");
  });

  it("unknown tool should return error message", async () => {
    const { executeTool } = await import("../lib/tool-executor");
    const { result } = await executeTool("nonexistent_tool", {});
    expect(result).toContain("Unknown function");
  });
});

describe("Conversation Scenarios (Regression)", () => {
  const greeter = AGENT_PERSONAS.find((a) => a.id === "greeter")!;

  it("scenario: caller mentions company + role → should trigger research", () => {
    expect(greeter.instructions).toContain("IMMEDIATELY call research_role");
    const transition = detectAgentTransition("greeter", "research_role");
    expect(transition?.id).toBe("researcher");
  });

  it("scenario: scheduling discussed → should switch to scheduler", () => {
    const transition = detectAgentTransition("greeter", "check_availability");
    expect(transition?.id).toBe("scheduler");
  });

  it("scenario: wrapping up → should switch to closer", () => {
    const transition = detectAgentTransition("greeter", "generate_summary");
    expect(transition?.id).toBe("closer");
  });

  it("scheduler should not re-offer meetings after booking", () => {
    const scheduler = AGENT_PERSONAS.find((a) => a.id === "scheduler")!;
    expect(scheduler.instructions).toContain("NEVER bring it up again");
  });

  it("greeter should not ask follow-up questions proactively", () => {
    expect(greeter.instructions).toContain("NEVER ask");
  });
});
