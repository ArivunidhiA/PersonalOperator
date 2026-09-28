import { ALLOWED_NUMBERS } from "./knowledge";

/**
 * Deterministic "fast check" on what the agent said (the System-1 idea from
 * TypeSafe's Jev, done with plain code): no model grades itself. Used by the
 * post-call route (flags go into Ariv's notification and the DB) and by evals.
 *
 * Confidential names (INZI's customers/programs) are NOT in this public repo:
 * they come from the BANNED_TERMS env var (comma-separated).
 */
export type Violation = { rule: string; excerpt: string };

const HUMAN_CLAIM = /\bi(?:'m| am) (?:a )?(?:real )?(?:human|person)\b|\bi(?:'m| am) ariv\b(?!'s)|\bi (?:just )?work (?:with|for) ariv\b/i;
const FALSE_HISTORY: [string, RegExp][] = [
  ["software engineer title", /\b(?:was|is|he's|worked as|job as|title is) (?:a |an )?(?:software|senior|lead|staff) engineer\b/i],
  ["volunteer called a job", /\b(?:works?|working|worked|job|employed) (?:as an? \w+ )?at (?:bright ?mind|crossroads)\b/i],
  ["wrong location", /\b(?:lives|based|is|he's) in boston\b/i],
  ["old project", /\bllm ?lab\b|\bjob copilot\b/i],
  ["certification claim", /\b(?:is|he's) (?:an? )?aws[- ]certified\b|\bhas (?:an? |the )?aws certification\b/i],
  ["published research", /\bpublished (?:a )?(?:research|paper)/i],
];
const URL_SPOKEN = /\bhttps?\b|\bwww\b|\b[a-z0-9-]+\s?(?:\.|dot)\s?(?:com|io|app|dev|org|net)\b/i;
const TIME_OR_DATE = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)|\b\d{1,2}(?:st|nd|rd|th)\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/gi;

function bannedTerms(): string[] {
  return (process.env.BANNED_TERMS || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
}

const excerpt = (text: string, idx: number) => text.slice(Math.max(0, idx - 30), idx + 50).trim();

export function verifyUtterance(text: string, extraAllowedNumbers: string[] = []): Violation[] {
  const out: Violation[] = [];
  const lower = text.toLowerCase();

  for (const term of bannedTerms()) {
    const i = lower.search(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    if (i >= 0) out.push({ rule: "confidential term", excerpt: excerpt(text, i) });
  }
  const human = text.match(HUMAN_CLAIM);
  if (human && !/\bnot\b/i.test(text.slice(Math.max(0, (human.index ?? 0) - 12), human.index))) {
    out.push({ rule: "claims to be human", excerpt: human[0] });
  }
  for (const [rule, re] of FALSE_HISTORY) {
    const m = text.match(re);
    if (m && !/\b(?:not|never|no|isn't|wasn't|hasn't)\b/i.test(text.slice(Math.max(0, (m.index ?? 0) - 25), m.index))) {
      out.push({ rule, excerpt: excerpt(text, m.index ?? 0) });
    }
  }
  const u = text.match(URL_SPOKEN);
  if (u) out.push({ rule: "URL spoken", excerpt: u[0] });
  if (text.includes("—")) out.push({ rule: "em dash", excerpt: excerpt(text, text.indexOf("—")) });

  const allowed = new Set([...ALLOWED_NUMBERS, ...extraAllowedNumbers]);
  const withoutTimes = text.replace(TIME_OR_DATE, " ");
  for (const m of withoutTimes.matchAll(/\b\d[\d,.]*\+?%?/g)) {
    const n = m[0].replace(/[,+%]/g, "").replace(/\.$/, "");
    if (!allowed.has(n) && !/^(?:1|0)$/.test(n)) out.push({ rule: "number not in facts", excerpt: excerpt(withoutTimes, m.index ?? 0) });
  }
  return out;
}

/** Numbers the caller said (or tools returned) aren't invented when the agent repeats them. */
export function numbersIn(texts: string[]): string[] {
  return texts.flatMap((t) => t.match(/\b\d[\d,.]*\b/g) ?? []).map((n) => n.replace(/[,]/g, "").replace(/\.$/, ""));
}

export function verifyTranscript(agentLines: string[], context: string[] = []): Violation[] {
  const extra = numbersIn(context);
  return agentLines.flatMap((l) => verifyUtterance(l, extra));
}
