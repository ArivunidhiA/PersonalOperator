import { turnstileToken } from "@/lib/turnstile-client";
import { prepareAudio, startGemini } from "./gemini";
import { startOpenAI } from "./openai";
import { sessionHints } from "../track-client";
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

async function fetchSession(signal: AbortSignal): Promise<SessionInfo> {
  const res = await fetch("/api/voice/session", {
    method: "POST",
    headers: { "x-ariv-client": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ ...sessionHints(), ts: await turnstileToken() }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as SessionInfo & { error?: string; code?: string };
  if (!res.ok) throw new StartError(data.error || "Couldn't start the call right now.", data.code || String(res.status));
  return data;
}

/** Start a call. Must be invoked directly from a click/tap handler. */
export async function startVoiceCall(h: VoiceHandlers, signal?: AbortSignal): Promise<{ session: VoiceSession; info: SessionInfo }> {
  const cancelled = () => new StartError("Call cancelled.", "cancelled");
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new StartError("This browser can't use a microphone here. Try Chrome, Safari or Edge.", "unsupported");
  }
  // Mic permission + the session fetch run concurrently. Both calls start
  // synchronously inside the tap (prepareAudio reaches getUserMedia before its
  // first await), so the iOS gesture requirement still holds. If the mic fails
  // the fetch is aborted; if the fetch fails the mic is released.
  const inner = new AbortController();
  const onAbort = () => inner.abort();
  if (signal?.aborted) inner.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  const audioP = prepareAudio().then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => {
      inner.abort();
      return { ok: false as const, e };
    },
  );
  const sessionP = fetchSession(inner.signal).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  const [audio, sess] = await Promise.all([audioP, sessionP]);
  signal?.removeEventListener("abort", onAbort);

  if (!audio.ok) throw micError(audio.e);
  const prepared = audio.v;
  const release = () => {
    prepared.mic.getTracks().forEach((t) => t.stop());
    void prepared.ctx.close().catch(() => {});
  };
  if (!sess.ok) {
    release();
    if (signal?.aborted) throw cancelled();
    if (sess.e instanceof StartError) throw sess.e;
    throw new StartError("Network issue. Check your connection and try again.", "network");
  }
  const info = sess.v;
  if (signal?.aborted) {
    release();
    throw cancelled();
  }

  try {
    if (info.provider === "openai") {
      void prepared.ctx.close().catch(() => {});
      return { session: await startOpenAI(info, prepared.mic, h), info };
    }
    return { session: await startGemini(info, prepared, h), info };
  } catch (err) {
    // Setup failed after the mic was granted: release it and the audio context.
    release();
    throw err instanceof StartError
      ? err
      : new StartError(err instanceof Error && err.message.startsWith("This browser") ? err.message : "Couldn't start the call. Try again in a minute.", "setup");
  }
}
