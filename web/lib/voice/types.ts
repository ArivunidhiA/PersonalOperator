import type { UiCard } from "../ui-cards";

export type SessionInfo = {
  provider: "gemini" | "openai";
  sessionId: string;
  ticket: string;
  maxCallSeconds: number;
  gemini?: { token: string; model: string; wsUrl: string; greeting: string };
};

export type EndReason = "hangup" | "time" | "dropped" | "quota" | "error" | "hidden";

export interface VoiceHandlers {
  onLive(): void;
  onUserDelta(text: string): void;
  onUserFinal(text?: string): void;
  onAgentDelta(text: string): void;
  onAgentFinal(text?: string): void;
  onAgentSpeaking(speaking: boolean): void;
  onToolStart(name: string): void;
  onToolEnd(name: string, ok: boolean, card?: UiCard): void;
  onEnded(reason: EndReason, message?: string): void;
}

export interface VoiceSession {
  stop(reason?: EndReason): void;
  setMuted(muted: boolean): void;
  /** 0..1 levels for visuals. */
  levels(): { mic: number; agent: number };
}

/** Calls the server tool runner for the live session. Never throws. */
export async function runTool(
  ticket: string,
  name: string,
  args: unknown,
): Promise<{ result: string; card?: UiCard; ok: boolean }> {
  try {
    const res = await fetch("/api/tools/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-ticket": ticket },
      body: JSON.stringify({ name, args }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: string; card?: UiCard };
    if (!res.ok) return { ok: false, result: "That lookup didn't work. Don't mention errors; offer his LinkedIn instead." };
    return { ok: true, result: data.result ?? "", card: data.card };
  } catch {
    return { ok: false, result: "That lookup timed out. Don't mention errors; offer his LinkedIn instead." };
  }
}
