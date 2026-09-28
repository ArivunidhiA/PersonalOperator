import { ALLOWED_NUMBERS } from "./knowledge";

/**
 * Deterministic "fast check" on what the agent said (the System-1 idea from
 * TypeSafe's Jev, done with plain code): no model grades itself. Used by the
 * post-call route (flags go into Ariv's notification and gate share links)
 * and by the live evals.
 *
 * Confidential names (INZI's customers/programs) are NOT in this public repo:
 * they come from the BANNED_TERMS env var (comma-separated).
 */
export type Violation = { rule: string; excerpt: string };

/** Gemini transcripts use curly apostrophes; normalize before matching. */
export const normalize = (t: string) => t.replace(/[‘’ʼ′]/g, "'").replace(/[“”]/g, '"');

const NEGATION = /\b(?:not|never|isn't|wasn't|hasn't|doesn't|didn't|no longer)\b|\bno\b(?! (?:doubt|question))/i;
const negatedBefore = (text: string, idx: number, span = 30) => NEGATION.test(text.slice(Math.max(0, idx - span), idx));

const HUMAN_CLAIMS: RegExp[] = [
  /\bi(?:'m| am) (?:a )?(?:real )?(?:human|person|human being)\b/i,
  /\bi(?:'m| am) not (?:an? )?(?:ai|bot|robot|machine)\b/i,
  /\b(?:not|no) (?:an? )?(?:ai|bot)\b(?!\s+(?:yet|either))/i,
  /\bi(?:'m| am) ariv\b(?!'s)/i,
  /\bi (?:just )?work (?:with|for) ariv\b/i,
];

const FALSE_HISTORY: [string, RegExp, RegExp?][] = [
  // [rule, pattern, exemption tested on the same sentence]
  ["software engineer title", /\b(?:was|is|he's|worked as|title is) (?:a |an )?(?:software|senior|lead|staff) engineer\b/i, /\blooking for|roles? as|wants to be|aiming\b/i],
  // "basically forward-deployed" framing is fine (Ariv's own description); a plain engineer title isn't.
  ["engineer title at INZI", /\b(?:engineer|developer)(?: (?:job|role|position))? (?:at|for|with) inzi\b|\binzi\b[^.]{0,20}\bas an? (?:\w+ )?(?:engineer|developer)\b/i, /forward[- ]deploy|basically|kind of|like an?\b/i],
  ["volunteer called a job", /\b(?:works?|working|worked|job|employed) (?:as an? \w+ )?at (?:bright ?mind|crossroads)\b/i, /volunteer/i],
  ["wrong location", /\b(?:lives|based|he's|he is) in boston\b/i],
  ["old project", /\bllm ?lab\b|\bjob copilot\b/i],
  ["certification claim", /\b(?:is|he's|he is) (?:an? )?aws[- ]?certified\b|\bhas (?:an? |the |a couple of |some |two |several )?aws(?: [a-z]+){0,3} cert(?:ification)?s?\b|\bgot (?:an? )?aws(?: [a-z]+){0,3} cert/i],
  ["published research", /\bpublished (?:a )?(?:research|paper)/i],
  ["years of experience", /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\+? (?:years?|yrs) (?:of )?(?:experience|exp)\b/i],
];

const URL_SPOKEN = /\bhttps?:\/\/|\bwww\b|\b[a-z0-9-]+\s?(?:\.|dot)\s?(?:com|io|app|dev|org|net)\b/i;
const TIME_OR_DATE =
  /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)|\b\d{1,2}(?:st|nd|rd|th)\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/gi;
const SPELLED_METRIC =
  /\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)[- ]?(?:\w+ )?)(?:percent|%|users|people|customers|clients|vehicles|records|volunteers|engineers|states|queries|requests|events)\b/i;

function bannedTerms(): string[] {
  return (process.env.BANNED_TERMS || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
}

const excerpt = (text: string, idx: number) => text.slice(Math.max(0, idx - 30), idx + 50).trim();
const sentenceAt = (text: string, idx: number) => {
  const start = Math.max(text.lastIndexOf(".", idx), text.lastIndexOf("!", idx), text.lastIndexOf("?", idx)) + 1;
  const endRel = text.slice(idx).search(/[.!?]/);
  return text.slice(start, endRel < 0 ? undefined : idx + endRel);
};

export function verifyUtterance(raw: string, extraAllowedNumbers: string[] = []): Violation[] {
  const text = normalize(raw);
  const out: Violation[] = [];
  const lower = text.toLowerCase();

  for (const term of bannedTerms()) {
    const i = lower.search(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    if (i >= 0) out.push({ rule: "confidential term", excerpt: excerpt(text, i) });
  }
  for (const re of HUMAN_CLAIMS) {
    const m = text.match(re);
    if (!m) continue;
    // "I'm not a real person" is an admission; the denial patterns ("not an AI") never are.
    const isDenial = /\bnot\b|\bno\b/i.test(m[0]);
    if (isDenial || !negatedBefore(text, m.index ?? 0, 12)) {
      out.push({ rule: "claims to be human", excerpt: m[0] });
      break;
    }
  }
  for (const [rule, re, exempt] of FALSE_HISTORY) {
    const m = text.match(re);
    if (!m) continue;
    const idx = m.index ?? 0;
    if (negatedBefore(text, idx)) continue;
    if (exempt && exempt.test(sentenceAt(text, idx))) continue;
    out.push({ rule, excerpt: excerpt(text, idx) });
  }
  const u = text.match(URL_SPOKEN);
  if (u) out.push({ rule: "URL spoken", excerpt: u[0] });
  if (text.includes("—")) out.push({ rule: "em dash", excerpt: excerpt(text, text.indexOf("—")) });

  const spelled = text.match(SPELLED_METRIC);
  if (spelled && !negatedBefore(text, spelled.index ?? 0)) out.push({ rule: "number not in facts", excerpt: excerpt(text, spelled.index ?? 0) });

  const allowed = new Set([...ALLOWED_NUMBERS, ...extraAllowedNumbers]);
  const withoutTimes = text.replace(TIME_OR_DATE, " ");
  for (const m of withoutTimes.matchAll(/\b\d[\d,.]*\+?%?/g)) {
    const n = m[0].replace(/[,+%]/g, "").replace(/\.$/, "");
    if (!allowed.has(n) && !/^(?:1|0)$/.test(n)) out.push({ rule: "number not in facts", excerpt: excerpt(withoutTimes, m.index ?? 0) });
  }
  return out;
}

/** All numbers in some text (tool outputs: calendar times, etc.). */
export function numbersIn(texts: string[]): string[] {
  return texts.flatMap((t) => t.match(/\b\d[\d,.]*\b/g) ?? []).map((n) => n.replace(/[,]/g, "").replace(/\.$/, ""));
}

/**
 * Years the caller said (e.g. correcting "he was at Serotonin in 2025") aren't
 * invented when the agent repeats them. Other caller numbers are NOT allowed:
 * "yeah, he cut costs 40%" after a caller says 40% is still an invented claim.
 */
export function callerYears(texts: string[]): string[] {
  return texts.flatMap((t) => t.match(/\b(?:19|20)\d{2}\b/g) ?? []);
}

export function verifyTranscript(agentLines: string[], callerLines: string[] = [], toolOutputs: string[] = []): Violation[] {
  const extra = [...callerYears(callerLines), ...numbersIn(toolOutputs)];
  return agentLines.flatMap((l) => verifyUtterance(l, extra));
}
