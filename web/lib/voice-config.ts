import { SYSTEM_PROMPT } from "./system-prompt";
import { AGENT_TOOLS } from "./tools";

/**
 * Voice engine configuration, shared by the session route, the evals and docs.
 *
 * Default: Gemini Live (gemini-3.8-live) on the Gemini API free tier, $0.
 * Optional fallback: OpenAI Realtime (paid), only if VOICE_FALLBACK=openai and
 * OPENAI_API_KEY are set. Used for regions the Gemini free tier can't serve,
 * or if Gemini is failing.
 */
export type VoiceProvider = "gemini" | "openai";

export const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
// "Casual" (Google's label). Ariv picked it from recorded samples on 2026-09-28.
export const GEMINI_VOICE = process.env.GEMINI_VOICE || "Zubenelgenubi";
export const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini";
export const OPENAI_VOICE = process.env.OPENAI_VOICE || "cedar";

/** Hard cap on one call. Gemini audio sessions are ~15 min without compression. */
export const MAX_CALL_SECONDS = 10 * 60;

/** Gemini API terms: the free tier can't serve users in the EEA, Switzerland or the UK. */
const PAID_ONLY_COUNTRIES = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH GB".split(" "),
);

export function geminiAllowedIn(country: string | null | undefined): boolean {
  // On Vercel every real request carries a country; if it's missing, don't assume it's allowed.
  if (!country) return !process.env.VERCEL_ENV;
  return !PAID_ONLY_COUNTRIES.has(country.toUpperCase());
}

/** The model doesn't know today's date; tell it (tokens are minted per call, so it's fresh). */
export function todayLine(now = new Date()): string {
  const d = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  return `\n\nTODAY\nToday is ${d} (US Eastern). Use it for "tomorrow", "this week" and how long ago things happened.`;
}

export function openAIFallbackEnabled(): boolean {
  return process.env.VOICE_FALLBACK === "openai" && !!process.env.OPENAI_API_KEY;
}

/** Pick the engine for a caller, or null if voice can't be offered to them. */
export function chooseProvider(country: string | null | undefined): VoiceProvider | null {
  const preferred = (process.env.VOICE_PROVIDER as VoiceProvider) || "gemini";
  const geminiReady = !!process.env.GEMINI_API_KEY && geminiAllowedIn(country);
  if (preferred === "openai" && openAIFallbackEnabled()) return "openai";
  if (geminiReady) return "gemini";
  if (openAIFallbackEnabled()) return "openai";
  return null;
}

const GREETING_NUDGE =
  "(The caller just connected. Greet them in one short, casual line, like a friend picking up the phone, and invite them to ask about Ariv. Then wait.)";
export { GREETING_NUDGE };

/** Gemini Live session config, locked into the ephemeral token server-side. */
export function buildGeminiLiveConfig(now = new Date()) {
  return {
    responseModalities: ["AUDIO"],
    systemInstruction: SYSTEM_PROMPT + todayLine(now),
    tools: [
      {
        functionDeclarations: AGENT_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
          behavior: t.blocking ? "BLOCKING" : "NON_BLOCKING",
        })),
      },
    ],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        // Low start sensitivity: fewer false barge-ins from speaker echo and room noise.
        startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
        endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
        prefixPaddingMs: 300,
        silenceDurationMs: 800,
      },
    },
    contextWindowCompression: { triggerTokens: "24000", slidingWindow: { targetTokens: "12000" } },
    sessionResumption: {},
  };
}

/** OpenAI Realtime session (GA shape) for the optional paid fallback. */
export function buildOpenAISession(now = new Date()) {
  return {
    type: "realtime",
    model: OPENAI_REALTIME_MODEL,
    output_modalities: ["audio"],
    instructions: SYSTEM_PROMPT + todayLine(now),
    tools: AGENT_TOOLS.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters })),
    tool_choice: "auto",
    reasoning: { effort: "low" },
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-realtime-whisper", language: "en" },
        turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true },
      },
      output: { voice: OPENAI_VOICE },
    },
  };
}
