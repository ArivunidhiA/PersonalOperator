import { prepareAudio, startGemini } from "./gemini";
import { startOpenAI } from "./openai";
import type { SessionInfo, VoiceHandlers, VoiceSession } from "./types";

export class StartError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

function micError(err: unknown): StartError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new StartError("Microphone access is blocked. Allow it for this site in your browser settings, then try again.", "mic_denied");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new StartError("No microphone found. Plug one in or try another device.", "no_mic");
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return new StartError("Your microphone is busy in another app. Close it there and try again.", "mic_busy");
  }
  return new StartError("Couldn't start your microphone. Try again, or try another browser.", "mic_error");
}

/** Start a call. Must be invoked directly from a click/tap handler. */
export async function startVoiceCall(h: VoiceHandlers): Promise<{ session: VoiceSession; info: SessionInfo }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new StartError("This browser can't use a microphone here. Try Chrome, Safari or Edge.", "unsupported");
  }
  // Gesture-bound work first (iOS): audio context + mic permission.
  let prepared: Awaited<ReturnType<typeof prepareAudio>>;
  try {
    prepared = await prepareAudio();
  } catch (err) {
    throw micError(err);
  }

  let info: SessionInfo;
  try {
    const res = await fetch("/api/voice/session", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as SessionInfo & { error?: string; code?: string };
    if (!res.ok) throw new StartError(data.error || "Couldn't start the call right now.", data.code || String(res.status));
    info = data;
  } catch (err) {
    prepared.mic.getTracks().forEach((t) => t.stop());
    void prepared.ctx.close().catch(() => {});
    if (err instanceof StartError) throw err;
    throw new StartError("Network issue. Check your connection and try again.", "network");
  }

  try {
    if (info.provider === "openai") {
      void prepared.ctx.close().catch(() => {});
      return { session: await startOpenAI(info, prepared.mic, h), info };
    }
    return { session: await startGemini(info, prepared, h), info };
  } catch (err) {
    // Setup failed after the mic was granted: release it and the audio context.
    prepared.mic.getTracks().forEach((t) => t.stop());
    void prepared.ctx.close().catch(() => {});
    throw err instanceof StartError
      ? err
      : new StartError(err instanceof Error && err.message.startsWith("This browser") ? err.message : "Couldn't start the call. Try again in a minute.", "setup");
  }
}
