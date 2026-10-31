/**
 * Client-side voice gate for the mic stream (NEXT_PUBLIC_CLIENT_VAD=1).
 *
 * Gemini Live runs its own VAD on the stream and documents that pausing audio
 * is allowed: send `audioStreamEnd` when the stream pauses, resume any time.
 * So continuous audio is not required. The gate:
 *  - forwards frames while speech is present and for `hangoverMs` after it ends;
 *  - then reports `streamEnd` once (flush the server's cached audio so the turn
 *    can finish without the silence it will no longer receive);
 *  - during silence keeps the last `preRollFrames` frames and flushes them in
 *    front of the first speech frame, so soft onsets are not clipped and speech
 *    onset adds no latency (the onset frame itself is sent immediately).
 * Detector: chunk RMS against an adaptive noise floor. A Silero model
 * (@ricky0123/vad-web) can replace `isSpeech` later without changing callers.
 */
export type GateResult<T> = { send: T[]; streamEnd: boolean };

export interface VadGateOptions {
  hangoverMs?: number;
  preRollFrames?: number;
  minRms?: number;
}

export function createVadGate<T>(opts: VadGateOptions = {}) {
  const hangoverMs = opts.hangoverMs ?? 300;
  const preRollMax = opts.preRollFrames ?? 6; // ~190 ms at 32 ms frames
  const minRms = opts.minRms ?? 0.012;
  let noise = 0.003; // slow estimate of the ambient RMS
  let lastSpeech = -Infinity;
  let gated = false; // true once streamEnd was reported for this silence
  const pre: T[] = [];

  return {
    push(rms: number, frame: T, now: number): GateResult<T> {
      const speech = rms > Math.max(minRms, noise * 3);
      if (!speech) noise = noise * 0.98 + rms * 0.02;
      if (speech) {
        lastSpeech = now;
        const send = [...pre, frame];
        pre.length = 0;
        gated = false;
        return { send, streamEnd: false };
      }
      if (now - lastSpeech <= hangoverMs) return { send: [frame], streamEnd: false };
      pre.push(frame);
      if (pre.length > preRollMax) pre.shift();
      if (!gated && lastSpeech > -Infinity) {
        gated = true;
        return { send: [], streamEnd: true };
      }
      gated = true;
      return { send: [], streamEnd: false };
    },
  };
}
