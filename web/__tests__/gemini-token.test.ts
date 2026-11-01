// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const create = vi.fn((_: unknown) => Promise.resolve({ name: "tok" }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    authTokens = { create };
  },
}));

describe("ephemeral token limits", () => {
  it("allows the two reconnects and nothing more, inside the call cap, with the config locked", async () => {
    const { mintGeminiToken } = await import("@/lib/gemini-token");
    const { MAX_CALL_SECONDS } = await import("@/lib/voice-config");
    const now = 1_800_000_000_000;
    await mintGeminiToken(now);
    const { config } = create.mock.calls[0][0] as { config: { uses: number; newSessionExpireTime: string; expireTime: string; liveConnectConstraints: { config: { systemInstruction: string } } } };
    expect(config.uses).toBe(3);
    const newSession = Date.parse(config.newSessionExpireTime) - now;
    expect(newSession).toBeGreaterThanOrEqual(MAX_CALL_SECONDS * 1000);
    expect(newSession).toBeLessThanOrEqual((MAX_CALL_SECONDS + 60) * 1000);
    expect(Date.parse(config.expireTime) - now).toBeLessThanOrEqual((MAX_CALL_SECONDS + 120) * 1000);
    expect(config.liveConnectConstraints.config.systemInstruction.length).toBeGreaterThan(100);
  });
});
