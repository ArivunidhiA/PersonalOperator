import { ALLOWED_NUMBERS } from "./knowledge";
import { CERT_CLAIM, HUMAN_CLAIMS, PLANNING_LEAK, TITLE_CLAIM, TITLE_EXEMPT, negatedBefore, normalize } from "./live-guard";
import { normalizeNumbers } from "./normalize-numbers";

export { normalize };

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

const FALSE_HISTORY: [string, RegExp, RegExp?][] = [
  // [rule, pattern, exemption tested on the same sentence]
  ["software engineer title", TITLE_CLAIM, TITLE_EXEMPT],
// Any engineer title at INZI (his title is Client Project Coordinator), in the usual phrasings.
  ["engineer title at INZI", /\b(?:engineer|developer)(?: (?:job|role|position))? (?:over )?(?:at|for|with) inzi\b|\binzi (?:\w+ )?(?:engineer|developer)\b|\bat inzi,? he(?:'s| is) (?:an? )?(?:\w+ )?(?:engineer|developer)\b|\binzi\b[^.]{0,20}\bas an? (?:\w+ )?(?:engineer|developer)\b|\btitle (?:at inzi )?is (?:an? )?(?!client project coordinator)[\w -]{0,30}(?:engineer|developer)\b/i, /\b(?:basically|kind of|like|essentially)\b[^.]{0,25}forward[- ]deployed|\bwork (?:is|looks) (?:basically |like )?forward[- ]deployed/i],
  // "Forward-deployed" describes the work, never his title.
  ["forward-deployed title", /\b(?:he(?:'s| is)|works as|title (?:at inzi )?is|job title is) (?:an? )?forward[- ]deployed (?:software )?engineer\b/i, /\b(?:basically|kind of|like|essentially|pretty much)\b/i],
  ["volunteer called a job", /\b(?:works?|working|worked|job|employed) (?:as an? \w+ )?at (?:bright ?mind|crossroads)\b/i, /volunteer/i],
  ["wrong location", /\b(?:lives|based|he's|he is) in boston\b/i],
  ["old project", /\bllm ?lab\b|\bjob copilot\b/i],
  ["certification claim", CERT_CLAIM],
  ["published research", /\bpublished (?:a )?(?:research|paper)/i],
  ["years of experience", /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\+? (?:years?|yrs) (?:of )?(?:experience|exp)\b/i],
];

const URL_SPOKEN = /\bhttps?:\/\/|\bwww\b|\b[a-z0-9-]+\s?(?:\.|dot)\s?(?:com|io|app|dev|org|net|edu|ai)\b/i;
const TIME_OR_DATE =
  /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)|\b\d{1,2}(?:st|nd|rd|th)\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/gi;
// Small counts are allowed ("two merged fixes") but not as invented metrics ("3 years", "a team of 4").
const SMALL_COUNT_CLAIM =
  /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten|dozen)\+? (?:years?|yrs|internships|products|engineers|people|reports|direct reports|clients|customers|startups|companies|x\b|times)\b|\b\d+(?:\.\d+)?\s?(?:%|percent|x\b)/i;
const SPELLED_METRIC =
  /\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)[- ]?(?:\w+ )?)(?:percent|%|users|people|customers|clients|vehicles|records|volunteers|engineers|states|queries|requests|events)\b/i;

// "Ariv prefers X" is an opinion he never gave: the facts hold no preferences. Asking him about one is fine.
const INVENTED_PREFERENCE =
  /\b(?:ariv|he)(?: \w+)? (?:prefers|favors|swears by|recommends)\b|\b(?:ariv|he)'?(?:s| is)? (?:\w+ )?(?:favorite|go-to)\b|\bhis (?:favorite|go-to|preferred)\b|\b(?:ariv|he) builds with both\b/i;
const PREFERENCE_EXEMPT = /\b(?:ask|don't know|not sure|no idea|not in my notes|whether)\b/i;

// Only full replies in another language, so a stray "hola" or a project name never counts.
const OTHER_SCRIPT = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Tamil}]/u;
const FOREIGN_WORDS =
  /\b(?:el|los|las|una|es|que|para|con|por|pero|muy|sobre|también|puedo|claro|le|les|des|est|et|pour|avec|une|mais|je|der|die|und|ist|nicht|das|ein|mit|für|auch)\b|[¿¡]/giu;
const ENGLISH_WORDS = /\b(?:the|is|and|he|his|to|of|a|in|it|that|for|with|but|on|you|i|i'm|what)\b/gi;

function isNonEnglish(text: string): boolean {
  if ((text.match(new RegExp(OTHER_SCRIPT, "gu")) ?? []).length >= 4) return true;
  if (text.split(/\s+/).length < 6) return false;
  const foreign = (text.match(FOREIGN_WORDS) ?? []).length;
  return foreign >= 3 && foreign > (text.match(ENGLISH_WORDS) ?? []).length;
}

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
  // Spelled numbers ("forty percent") become digits so the number checks see them.
  const text = normalizeNumbers(normalize(raw));
  const out: Violation[] = [];
  const lower = text.toLowerCase();

  for (const term of bannedTerms()) {
    const i = lower.search(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    if (i >= 0) out.push({ rule: "confidential term", excerpt: excerpt(text, i) });
  }
  for (const re of HUMAN_CLAIMS) {
    const m = text.match(re);
    if (!m) continue;
    // The patterns only match direct claims ("I'm not a real person" never matches), so a
    // leading "No," doesn't excuse "No, I'm a real person". Only "you're not talking to a real person" does.
    if (/^you/i.test(m[0]) && negatedBefore(text, (m.index ?? 0) + 12, 16)) continue;
    out.push({ rule: "claims to be human", excerpt: m[0] });
    break;
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

  const leak = text.match(PLANNING_LEAK);
  if (leak) out.push({ rule: "markdown or planning text", excerpt: excerpt(text, leak.index ?? 0) });
  const preference = text.match(INVENTED_PREFERENCE);
  if (preference && !negatedBefore(text, preference.index ?? 0) && !PREFERENCE_EXEMPT.test(sentenceAt(text, preference.index ?? 0))) {
    out.push({ rule: "invented preference", excerpt: excerpt(text, preference.index ?? 0) });
  }
  if (isNonEnglish(text)) out.push({ rule: "non-English output", excerpt: excerpt(text, 0) });

  const small = text.match(SMALL_COUNT_CLAIM);
  if (small && !negatedBefore(text, small.index ?? 0) && !/\b(?:merged|fixes|changes|features|operating systems|python versions|nonprofits)\b/i.test(text.slice(small.index ?? 0, (small.index ?? 0) + 40))) {
    out.push({ rule: "number not in facts", excerpt: excerpt(text, small.index ?? 0) });
  }
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
