/**
 * Live captions only: Chrome's speech service has no vocabulary hints, so it hears "Eric" for Ariv.
 * These are the misses it actually made, each anchored so ordinary words stay alone ("forecast" only
 * after "built/with", "vector" only after "and/use"). Gemini's final text is never rewritten.
 */
const FIXES: [RegExp, string][] = [
  [/\b(eric|erik|arif|aref|arive|ariel)\b/gi, "Ariv"],
  [/\b(?:nz|n z|indy|indie|lindsay|linzy|enzi|anzi|inzie|insie)(?= controls?\b)/gi, "INZI"],
  [/\b(with|using|built|called|about) (?:forecast|focused|focus|for cost|forkest)\b/gi, "$1 forecost"],
  [/\b(?:is|about|called) (?:registering|register|registered|we just from|ridges from)(?= one| his| a| the)\b/gi, "is Registrum"],
  [/\b(?:melbit|mel bid|mel bit|malbid|melbid)\b/gi, "Malbit"],
  [/\b(and|use|with) (?:vector|victor|perfecter)\b/gi, "$1 pgvector"],
  [/\b(?:no|name of|name|nemo|no mer) ?curator\b/gi, "NeMo Curator"],
];

export function fixNames(text: string): string {
  return FIXES.reduce((t, [re, to]) => t.replace(re, to), text);
}
