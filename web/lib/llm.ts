import { createLogger } from "./logger";

const log = createLogger({ tool: "llm" });

/**
 * Small JSON-returning text model calls (role research, post-call summary).
 *
 * Provider order (override with LLM_PROVIDER=gemini|gateway|openai):
 * 1. gemini  - Gemini API free tier (GEMINI_API_KEY). $0.
 * 2. gateway - Claude through Vercel AI Gateway's Anthropic Messages API
 *              (AI_GATEWAY_API_KEY). Needs gateway credits for Claude models.
 * 3. openai  - OpenAI chat completions (OPENAI_API_KEY). Paid.
 */
type Provider = "gemini" | "gateway" | "openai";

export const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash-lite";
// Free-tier text models return 503 "high demand" at times; try the next one.
const GEMINI_TEXT_FALLBACKS = (process.env.GEMINI_TEXT_FALLBACKS || "gemini-3.8-flash,gemini-flash-latest")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
export const GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-haiku-4.5";
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

export function textProvider(): Provider | null {
  const forced = process.env.LLM_PROVIDER as Provider | undefined;
  const has: Record<Provider, boolean> = {
    gemini: !!process.env.GEMINI_API_KEY,
    gateway: !!process.env.AI_GATEWAY_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  };
  if (forced && has[forced]) return forced;
  return (["gemini", "gateway", "openai"] as Provider[]).find((p) => has[p]) ?? null;
}

export type JsonCall = {
  system: string;
  user: string;
  /** JSON Schema for the answer (used natively by Gemini; described to the others). */
  schema: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
};

/** Returns parsed JSON, or null on any failure (callers must have a fallback). */
export async function completeJSON<T>(call: JsonCall): Promise<T | null> {
  const provider = textProvider();
  if (!provider) return null;
  const budget = call.timeoutMs ?? 6000;
  const started = Date.now();
  const models = provider === "gemini" ? [GEMINI_TEXT_MODEL, ...GEMINI_TEXT_FALLBACKS.filter((m) => m !== GEMINI_TEXT_MODEL)] : [""];
  for (const model of models) {
    const left = budget - (Date.now() - started);
    if (left < 1500) break;
    // Give each model a fair share so one overloaded model can't eat the whole budget.
    const slice = Math.min(left, Math.max(4000, Math.floor(budget / models.length)));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), slice);
    try {
      const text =
        provider === "gemini" ? await gemini(call, ctrl.signal, model) : provider === "gateway" ? await gateway(call, ctrl.signal) : await openai(call, ctrl.signal);
      const parsed = parseJson<T>(text);
      log.info("llm call", { provider, model: model || undefined, ms: Date.now() - started, ok: parsed !== null });
      if (parsed !== null) return parsed;
    } catch (err) {
      log.warn("llm call failed", { provider, model: model || undefined, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function parseJson<T>(text: string | null | undefined): T | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

async function gemini(call: JsonCall, signal: AbortSignal, model: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: call.system }] },
        contents: [{ role: "user", parts: [{ text: call.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: call.schema,
          maxOutputTokens: call.maxTokens ?? 600,
          temperature: 0.2,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
}

async function gateway(call: JsonCall, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.AI_GATEWAY_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      max_tokens: call.maxTokens ?? 600,
      system: `${call.system}\n\nReply with only a JSON object matching this JSON Schema, no prose:\n${JSON.stringify(call.schema)}`,
      messages: [{ role: "user", content: call.user }],
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
}

async function openai(call: JsonCall, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      response_format: { type: "json_object" },
      max_tokens: call.maxTokens ?? 600,
      temperature: 0.2,
      messages: [
        { role: "system", content: `${call.system}\n\nReply with a JSON object matching: ${JSON.stringify(call.schema)}` },
        { role: "user", content: call.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
