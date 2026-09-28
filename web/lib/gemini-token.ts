import { GoogleGenAI } from "@google/genai";
import { GEMINI_LIVE_MODEL, MAX_CALL_SECONDS, buildGeminiLiveConfig } from "./voice-config";

export const GEMINI_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

/**
 * Mints a single-use ephemeral Gemini Live token with the whole session setup
 * (prompt, tools, voice, VAD) locked in. The browser can only open that exact
 * session; anything it sends in its own setup is ignored. Used by the session
 * route and by the live evals, so evals test exactly what production runs.
 */
export async function mintGeminiToken(now = Date.now()): Promise<{ token: string; model: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { apiVersion: "v1beta" } });
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      expireTime: new Date(now + (MAX_CALL_SECONDS + 120) * 1000).toISOString(),
      liveConnectConstraints: { model: GEMINI_LIVE_MODEL, config: buildGeminiLiveConfig() as never },
      httpOptions: { apiVersion: "v1beta" },
    },
  });
  if (!token.name) throw new Error("Gemini returned no token");
  return { token: token.name, model: GEMINI_LIVE_MODEL };
}
