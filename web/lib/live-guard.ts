/**
 * Live guard: a pure, high-precision check on what the agent is saying while it
 * says it. A false hit cuts a good reply, so it only fires on lines that are
 * wrong in any context: a human claim, a claimed title or certification, a
 * confidential term, leaked planning text or markdown. Everything softer
 * (numbers, tone, spoken URLs) stays in the post-call check, lib/verifier.ts.
 *
 * No imports and no env access, so it can ship to the browser. Confidential
 * terms never do: the session route hashes them with a per-call salt
 * (guardConfig), and the client only compares hashes.
 *
 *   const guard = createLiveGuard(config);   // config from /api/voice/session
 *   const hit = guard.push(transcriptDelta); // null, or the hit (once per turn)
 *   const last = guard.flush();              // at turn end
 *   guard.reset();                           // before the next turn
 */
export type GuardRule = "confidential term" | "claims to be human" | "claimed title" | "claimed certification" | "markdown or planning text";
export type GuardHit = { rule: GuardRule; excerpt: string };
/** Sent to the client. `hashes` are salted, so they differ on every call. */
export type GuardConfig = { salt: string; hashes: string[]; maxWords: number };

/** Gemini transcripts use curly apostrophes; normalize before matching. */
export const normalize = (t: string) => t.replace(/[‘’ʼ′]/g, "'").replace(/[“”]/g, '"');

export const HUMAN_CLAIMS: RegExp[] = [
  /\bi(?:'m| am) (?:a |an )?(?:real |actual |living )?(?:human|person|human being)\b/i,
  /\byou(?:'re| are) (?:talking|speaking) (?:to|with) (?:a )?(?:real |actual )?(?:human|person)\b/i,
  /\bi(?:'m| am) not (?:an? )?(?:ai|bot|robot|machine)\b/i,
  /\b(?:not|no) (?:an? )?(?:ai|bot)\b(?!\s+(?:yet|either))/i,
  /\bi(?:'m| am) ariv\b(?!'s)/i,
  /\bi (?:just )?work (?:with|for) ariv\b/i,
];

/** Tables, headings, bold, and the model's own notes to itself. Never fits spoken text. */
export const PLANNING_LEAK =
  /\|\s*:?-{3,}|^\s*\|.*\|\s*$|\*\*[^*\n]+\*\*|^\s{0,3}#{1,6} \S|^\s*```|\bcall to action\s*[:|]|\bask the (?:user|caller) (?:for|about|if|whether)\b|\[(?:pause|laughs?|chuckles?|sighs?)\]|^\s*(?:thought|plan|reasoning|internal note|intent)\s*:/im;

// A software or AI engineer title stated as fact, or a role name that claims one.
export const TITLE_CLAIM =
  /\b(?:was|is|he's|worked as|title is|title was) (?:a |an )?(?:software|senior|lead|staff|ai) engineer\b|\bsoftware engineer(?:ing)? intern\b/i;
export const TITLE_EXEMPT = /\blooking for|roles? as|wants to be|aiming|at heart\b/i;

export const CERT_CLAIM =
  /\b(?:is|he's|he is|is he) (?:an? )?aws[- ]?certified\b|\bhas (?:an? |the |a couple of |some |two |several )?aws(?: [a-z]+){0,3} cert(?:ification)?s?\b|\bgot (?:an? )?aws(?: [a-z]+){0,3} cert/i;

// "not only" and "no doubt" are emphasis, not negation.
const NEGATION = /\b(?:not(?! only)|never|isn't|wasn't|hasn't|doesn't|didn't|no longer)\b|\bno\b(?! (?:doubt|question))/i;
export const negatedBefore = (text: string, idx: number, span = 30) => NEGATION.test(text.slice(Math.max(0, idx - span), idx));

const K = new Uint32Array(64);
const H0 = new Uint32Array(8);
{
  // SHA-256 constants: the fractional bits of the roots of the first 64 primes.
  let n = 0;
  for (let p = 2; n < 64; p++) {
    let prime = true;
    for (let d = 2; d * d <= p; d++) if (p % d === 0) prime = false;
    if (!prime) continue;
    if (n < 8) H0[n] = ((Math.sqrt(p) % 1) * 2 ** 32) >>> 0;
    K[n++] = ((Math.cbrt(p) % 1) * 2 ** 32) >>> 0;
  }
}
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 as hex. Synchronous, because Web Crypto is async and this runs on every delta. */
export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const blocks = Math.ceil((bytes.length + 9) / 64);
  const buf = new Uint8Array(blocks * 64);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(buf.length - 4, (bytes.length * 8) >>> 0);
  const h = H0.slice();
  const w = new Uint32Array(64);
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(b * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a0, b0, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a0, 2) ^ rotr(a0, 13) ^ rotr(a0, 22)) + ((a0 & b0) ^ (a0 & c) ^ (b0 & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b0;
      b0 = a0;
      a0 = (t1 + t2) | 0;
    }
    [a0, b0, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] + v) | 0));
  }
  return [...h].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

const words = (t: string) =>
  normalize(t)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
const termHash = (salt: string, phrase: string) => sha256(`${salt}:${phrase}`);

/**
 * Server side only: hash the terms for one call. The terms must come from the
 * caller of this function (the route reads BANNED_TERMS), never from this file.
 */
export function guardConfig(terms: string[], salt: string): GuardConfig {
  const clean = terms.map((t) => words(t).join(" ")).filter((t) => t.length >= 3);
  return {
    salt,
    hashes: [...new Set(clean.map((t) => termHash(salt, t)))],
    maxWords: clean.reduce((m, t) => Math.max(m, t.split(" ").length), 1),
  };
}

function confidentialIn(w: string[], cfg: GuardConfig, from = 0): GuardHit | null {
  for (let i = from; i < w.length; i++) {
    for (let n = 1; n <= cfg.maxWords && i + n <= w.length; n++) {
      if (cfg.hashes.includes(termHash(cfg.salt, w.slice(i, i + n).join(" ")))) return { rule: "confidential term", excerpt: "[redacted]" };
    }
  }
  return null;
}

/** A complete sentence. Questions are skipped: "is he AWS certified?" claims nothing. */
function checkSentence(raw: string): GuardHit | null {
  const s = normalize(raw).trim();
  const planning = s.match(PLANNING_LEAK);
  if (planning) return { rule: "markdown or planning text", excerpt: planning[0].trim().slice(0, 60) };
  if (s.endsWith("?")) return null;
  for (const re of HUMAN_CLAIMS) {
    const m = s.match(re);
    if (m && !(/^you/i.test(m[0]) && negatedBefore(s, (m.index ?? 0) + 12, 16))) return { rule: "claims to be human", excerpt: m[0] };
  }
  const title = s.match(TITLE_CLAIM);
  if (title && !negatedBefore(s, title.index ?? 0) && !TITLE_EXEMPT.test(s)) return { rule: "claimed title", excerpt: title[0] };
  const cert = s.match(CERT_CLAIM);
  if (cert && !negatedBefore(s, cert.index ?? 0)) return { rule: "claimed certification", excerpt: cert[0] };
  return null;
}

const SENTENCE_END = /[.!?]+\s+|\n+/g;

/** One-shot check of finished text. */
export function checkLive(text: string, cfg?: GuardConfig | null): GuardHit | null {
  const guard = createLiveGuard(cfg);
  return guard.push(text) ?? guard.flush();
}

/**
 * Streaming check for transcript deltas. Holds back the unfinished sentence, so
 * "He's a software engineer" can't fire before "at heart" arrives, and the
 * unfinished word, so "acme" can't fire on the way to "acmeautomation".
 * Reports at most one hit per turn.
 */
export function createLiveGuard(cfg?: GuardConfig | null) {
  let text = "";
  let sentenceFrom = 0;
  let wordsScanned = 0;
  let done = false;

  const fire = (hit: GuardHit | null) => {
    if (hit) done = true;
    return hit;
  };
  const scanTerms = (finished: string) => {
    if (!cfg?.hashes.length) return null;
    const w = words(finished);
    // Re-read the last few words: a term can span two deltas.
    const hit = confidentialIn(w, cfg, Math.max(0, wordsScanned - cfg.maxWords + 1));
    wordsScanned = w.length;
    return hit;
  };

  return {
    push(delta: string): GuardHit | null {
      if (done) return null;
      text += delta;
      const secret = scanTerms(text.slice(0, text.search(/\S*$/)));
      if (secret) return fire(secret);
      SENTENCE_END.lastIndex = sentenceFrom;
      for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) {
        const end = m.index + m[0].length;
        const hit = checkSentence(text.slice(sentenceFrom, end));
        sentenceFrom = end;
        if (hit) return fire(hit);
      }
      return null;
    },
    /** End of the turn: whatever is left counts as finished. */
    flush(): GuardHit | null {
      if (done) return null;
      return fire(scanTerms(text) ?? checkSentence(text.slice(sentenceFrom)));
    },
    reset() {
      text = "";
      sentenceFrom = 0;
      wordsScanned = 0;
      done = false;
    },
  };
}
