/**
 * Live guard: a pure, high-precision check on what the agent is saying while it
 * says it. A false hit cuts a good reply, so it only fires on lines that are
 * wrong in any context: a human claim, a claimed title or certification, ruling
 * a named company in or out, leaked planning text or markdown. Everything softer (numbers, tone, spoken URLs)
 * stays in the post-call check, lib/verifier.ts.
 *
 * Confidential terms are checked after the call on the server only. Anything
 * the browser could match them with, a salted hash included, also lets a caller
 * confirm a guessed name, so nothing about them may ship here. The named-company
 * rule is how a caller's guess stays unsaid instead: it treats every name alike.
 *
 *   const guard = createLiveGuard();
 *   const hit = guard.push(transcriptDelta); // null, or the hit (once per turn)
 *   const last = guard.flush();              // at turn end
 *   guard.reset();                           // before the next turn
 */
export type GuardRule = "named company" | "claims to be human" | "claimed title" | "claimed certification" | "markdown or planning text";
export type GuardHit = { rule: GuardRule; excerpt: string };

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

// "He hasn't worked at X" and "his notes say Y, not X" about a company outside his history.
// Case-sensitive on purpose: the capital is what marks a name, and it fires on that first letter.
const EMPLOYER = "(?!Hyundai|INZI|Serotonin|Northeastern)[A-Z]";
const WORKED_AT = new RegExp(`\\b[Ww]ork(?:ed|ing|s)? (?:at|with|for) ${EMPLOYER}`);
const NOT_AT = new RegExp(`\\b(?:INZI|Controls|Hyundai|Serotonin|Northeastern),? not ${EMPLOYER}`);
const NO_RECORD = /\b(?:history|record|sign|mention)\b/i;

// "not only" and "no doubt" are emphasis, not negation.
const NEGATION = /\b(?:not(?! only)|never|isn't|wasn't|hasn't|doesn't|didn't|no longer)\b|\bno\b(?! (?:doubt|question))/i;
export const negatedBefore = (text: string, idx: number, span = 30) => NEGATION.test(text.slice(Math.max(0, idx - span), idx));

/** Runs on every delta, not per sentence: the name must never reach the screen or the speakers. */
function namedCompany(raw: string): GuardHit | null {
  const s = normalize(raw);
  const worked = s.match(WORKED_AT);
  const denied = worked && (negatedBefore(s, worked.index ?? 0) || NO_RECORD.test(s.slice(0, worked.index)));
  return denied || NOT_AT.test(s) ? { rule: "named company", excerpt: "[redacted]" } : null;
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
export function checkLive(text: string): GuardHit | null {
  const guard = createLiveGuard();
  return guard.push(text) ?? guard.flush();
}

/**
 * Streaming check for transcript deltas. Holds back the unfinished sentence, so
 * "He's a software engineer" can't fire before "at heart" arrives. Reports at
 * most one hit per turn.
 */
export function createLiveGuard() {
  let text = "";
  let sentenceFrom = 0;
  let done = false;

  const fire = (hit: GuardHit | null) => {
    if (hit) done = true;
    return hit;
  };

  return {
    push(delta: string): GuardHit | null {
      if (done) return null;
      text += delta;
      const company = namedCompany(text.slice(sentenceFrom));
      if (company) return fire(company);
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
      return fire(checkSentence(text.slice(sentenceFrom)));
    },
    reset() {
      text = "";
      sentenceFrom = 0;
      done = false;
    },
  };
}
