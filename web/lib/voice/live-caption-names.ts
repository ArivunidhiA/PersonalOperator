/**
 * Live captions only: Chrome's speech service has no vocabulary hints, so it hears "Eric" for Ariv.
 * These are the misses it actually made, each anchored so ordinary words stay alone ("forecast" only
 * after "built/with", "vector" only after "and/use"). Gemini's final text is never rewritten.
 */
// "Eric" only where the phrase is about the person the site covers; "my friend Eric" stays.
const FIXES: [RegExp, string][] = [
  [/\b(does|did|is|was|has|can|would|could|whether|about|hire|hiring|for) (?:eric|erik)\b/gi, "$1 Ariv"],
  [/\b(?:eric|erik)(?= (?:work|worked|works|build|built|do|does|use|used|would|have|has|know|knows|'s)\b)/gi, "Ariv"],
  [/\b(?:arif|aref|arive)\b/gi, "Ariv"],
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
