/**
 * Spelled numbers and percents -> digits, so the verifier's digit check also
 * sees "forty percent", "fifty million" and "twenty twenty five". Words-to-numbers
 * rules in the spirit of NeMo Speech Data Processor's number normalization,
 * kept dependency-free.
 *
 * Deliberately conservative: a bare number below ten ("two merged fixes",
 * "one of") stays a word (the small-count rule judges those); a number is
 * converted when it is >= 10, or is directly followed by "percent".
 */
const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };

const NUM = [...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), "hundred", ...Object.keys(SCALES)].join("|");
// A run of number words joined by space/hyphen (optionally "a", "and", "point"), then an optional "percent".
const RUN = new RegExp(`\\b(?:a )?(?:${NUM})(?:[- ](?:${NUM}|and|point))*\\b(?:\\s+percent\\b)?`, "gi");

function parseRun(words: string[]): number | null {
  // Year form: "twenty twenty five", "nineteen ninety nine".
  if (words.length >= 2 && (words[0] === "twenty" || words[0] === "nineteen") && words[1] in TENS && words.length <= 3) {
    const unit = words[2] === undefined ? 0 : UNITS[words[2]];
    if (unit !== undefined) return (TENS[words[0]] ?? TEENS[words[0]]) * 100 + TENS[words[1]] + unit;
  }
  let total = 0;
  let cur = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "a" || w === "and") continue;
    if (w === "point") {
      const digits = words.slice(i + 1).map((d) => UNITS[d]);
      if (!digits.length || digits.some((d) => d === undefined)) return null;
      return Number(`${total + cur}.${digits.join("")}`);
    }
    if (w in UNITS) cur += UNITS[w];
    else if (w in TEENS) cur += TEENS[w];
    else if (w in TENS) cur += TENS[w];
    else if (w === "hundred") cur = (cur || 1) * 100;
    else if (w in SCALES) { total += (cur || 1) * SCALES[w]; cur = 0; }
    else return null;
  }
  return total + cur;
}

export function normalizeNumbers(text: string): string {
  return text.replace(RUN, (match) => {
    const percent = /\s+percent$/i.test(match);
    const words = match.replace(/\s+percent$/i, "").toLowerCase().split(/[\s-]+/).filter(Boolean);
    const n = parseRun(words);
    if (n === null) return match;
    if (!percent && n < 10) return match;
    return `${n}${percent ? "%" : ""}`;
  });
}
