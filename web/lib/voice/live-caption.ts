import { fixNames } from "./live-caption-names";

/**
 * Live captions: the caller's words as they speak, from Chrome's Web Speech service.
 * Fed from the call's own echo-cancelled mic track (a clone) through SpeechRecognition.start(track),
 * so it never opens a second mic. Display only: Gemini stays the voice path and its transcript is the
 * final text (see transcript.ts). Anything going wrong here ends captions quietly, never the call.
 */
export type Caption = {
  /** Grows by one per recognized phrase. */
  utterance: number;
  text: string;
  /** Leading characters two updates agreed on. The rest may still change, so show it dimmer. */
  settled: number;
  final: boolean;
};

export type LiveCaptionOptions = {
  onCaption(c: Caption): void;
  /** An already shown caption turned out to be the agent's voice. */
  onCancel?(): void;
  /** Captions stopped for good this call. Gemini's text carries on. */
  onUnavailable?(reason: string): void;
};

export interface LiveCaption {
  stop(): void;
  setMuted(muted: boolean): void;
  /** Call on every change of the agent's playback state. */
  setAgentSpeaking(speaking: boolean): void;
  /** Feed the agent's transcript so its voice can be told from the caller's. */
  addAgentText(text: string): void;
  /** Gemini reported a barge-in: release what the caller said over the agent. */
  bargeIn(): void;
}

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track: MediaStreamTrack): void;
  abort(): void;
};
type RecognitionClass = { new (): Recognition; available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string> };

const LANG = "en-US";
/** Errors that won't clear up by restarting. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "network"]);
/** Chrome ends a recognition session now and then; restart, but not in a tight failing loop. */
const MAX_QUICK_RESTARTS = 3;
const QUICK_MS = 2000;
/** Speech heard this soon after the agent stops may be its tail in the room or still in recognition. */
const ECHO_TAIL_MS = 600;
const ECHO_WORD_SHARE = 0.6;
const AGENT_WORDS_KEPT = 120;

function recognitionClass(w: Window): RecognitionClass | null {
  const x = w as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return x.SpeechRecognition ?? x.webkitSpeechRecognition ?? null;
}

/**
 * Desktop Chromium only. available() marks the build that also has start(track). Safari and iOS have
 * the old API, which would open its own mic without echo cancelling and cut into the call's audio.
 * Phones stay off until tested on a real device. NEXT_PUBLIC_LIVE_CAPTIONS=0 turns captions off.
 */
export function liveCaptionSupported(w: Window = window): boolean {
  if (process.env.NEXT_PUBLIC_LIVE_CAPTIONS === "0") return false;
  const ua = w.navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || !/Chrome\//.test(ua)) return false;
  return typeof recognitionClass(w)?.available === "function";
}

const words = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);

/** Caption words most of which the agent just said: its own voice coming back through the mic. */
export function looksLikeEcho(caption: string, agentWords: string[]): boolean {
  const w = words(caption);
  if (!w.length || !agentWords.length) return false;
  const heard = new Set(agentWords);
  return w.filter((x) => heard.has(x)).length / w.length >= ECHO_WORD_SHARE;
}

/** Characters of `b` covered by the words it shares with `a` from the start. */
export function settledChars(a: string, b: string): number {
  const x = a.split(" ");
  const y = b.split(" ");
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return y.slice(0, n).join(" ").length;
}

/** Start captions on a clone of `track`. Returns null when unsupported, so the caller just goes without. */
export function startLiveCaption(track: MediaStreamTrack, opts: LiveCaptionOptions, w: Window = window): LiveCaption | null {
  if (!liveCaptionSupported(w)) return null;
  const Rec = recognitionClass(w)!;
  let clone: MediaStreamTrack;
  try {
    clone = track.clone();
  } catch {
    return null;
  }

  let rec: Recognition | null = null;
  let stopped = false;
  let muted = false;
  let speaking = false;
  let quietAt = 0; // when the agent last stopped speaking
  let heldOver = false; // this utterance began while the agent spoke
  let held: Caption | null = null;
  let shownThisUtterance = false;
  let utterance = 1;
  let doneIdx = 0; // results before this index are finished phrases
  let prev = "";
  let startedAt = 0;
  let quickRestarts = 0;
  let agentWords: string[] = [];
  let restart: ReturnType<typeof setTimeout> | null = null;

  const safely = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* captions never reach the call */
    }
  };
  const shut = () => {
    stopped = true;
    if (restart) clearTimeout(restart);
    const r = rec;
    rec = null;
    if (r) {
      r.onresult = r.onerror = r.onend = null;
      safely(() => r.abort());
    }
    safely(() => clone.stop());
  };
  const giveUp = (reason: string) => {
    if (stopped) return;
    shut();
    safely(() => opts.onUnavailable?.(reason));
  };

  const show = (c: Caption) => {
    shownThisUtterance = true;
    safely(() => opts.onCaption(c));
  };
  const nextUtterance = () => {
    utterance++;
    prev = "";
    heldOver = false;
    held = null;
    shownThisUtterance = false;
  };

  const inEchoWindow = () => speaking || Date.now() - quietAt < ECHO_TAIL_MS;

  const onText = (text: string, final: boolean) => {
    const fixed = fixNames(text.trim());
    if (!fixed) return;
    const c: Caption = { utterance, text: fixed, settled: final ? fixed.length : settledChars(prev, fixed), final };
    prev = fixed;
    if (inEchoWindow()) heldOver = true;
    if (heldOver) {
      // Started over the agent: hold it. Barge-in releases it; matching the agent's words drops it.
      if (looksLikeEcho(fixed, agentWords)) {
        held = null;
        if (shownThisUtterance) safely(() => opts.onCancel?.());
      } else {
        held = c;
        if (!speaking && !inEchoWindow()) release();
      }
      if (final) nextUtterance();
      return;
    }
    show(c);
    if (final) nextUtterance();
  };

  const release = () => {
    if (held) show(held);
    held = null;
    heldOver = false;
  };

  const start = () => {
    if (stopped || muted) return;
    try {
      const r = new Rec();
      r.lang = LANG;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      doneIdx = 0;
      r.onresult = (e) => {
        safely(() => {
          let partial = "";
          for (let i = doneIdx; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
              onText(res[0].transcript, true);
              doneIdx = i + 1;
              partial = "";
            } else {
              partial += res[0].transcript;
            }
          }
          if (partial) onText(partial, false);
        });
      };
      r.onerror = (e) => {
        if (FATAL.has(e.error)) giveUp(e.error);
      };
      r.onend = () => {
        if (stopped || muted) return;
        quickRestarts = Date.now() - startedAt < QUICK_MS ? quickRestarts + 1 : 0;
        if (quickRestarts >= MAX_QUICK_RESTARTS) return giveUp("restart-loop");
        restart = setTimeout(start, 100 * (quickRestarts + 1));
      };
      startedAt = Date.now();
      r.start(clone);
      rec = r;
    } catch {
      giveUp("start-failed");
    }
  };

  const pause = () => {
    if (restart) clearTimeout(restart);
    const r = rec;
    rec = null;
    if (r) {
      r.onresult = r.onerror = r.onend = null;
      safely(() => r.abort());
    }
    nextUtterance();
  };

  // Don't hold up the call on the availability check; a bad answer just ends captions.
  const ready = Rec.available?.({ langs: [LANG], processLocally: false }) ?? Promise.resolve("available");
  ready.then(
    (state) => {
      if (state === "available") start();
      else giveUp(state);
    },
    () => giveUp("availability-check"),
  );

  return {
    stop: () => {
      if (!stopped) shut();
    },
    setMuted: (m) => {
      if (stopped || m === muted) return;
      muted = m;
      if (m) pause();
      else start();
    },
    setAgentSpeaking: (s) => {
      if (s === speaking) return;
      speaking = s;
      if (!s) quietAt = Date.now();
    },
    addAgentText: (text) => {
      agentWords = [...agentWords, ...words(text)].slice(-AGENT_WORDS_KEPT);
    },
    bargeIn: () => {
      speaking = false;
      quietAt = 0;
      release();
    },
  };
}
