/**
 * Oversell and undersell rubric, kept apart from the prompt and from the model:
 * plain regex over what the caller heard, in the turn they heard it. It encodes
 * the owner decisions in docs/checklists/voice-overhaul.md and the lines from
 * Ariv's own call. Nothing here is graded by an LLM.
 */
import type { TurnResult } from "./harness";
import { normalize } from "@/lib/verifier";

type Check = { name: string; pass: (turns: TurnResult[]) => boolean };
const replies = (t: TurnResult[]) => t.slice(1).map((x) => ({ user: x.user ?? "", said: normalize(x.spoken.join(" ")) }));

// Lines from Ariv's call and their close cousins. Wrong whatever the caller asked.
const SELF_SABOTAGE =
  /\bthat's not him\b|\bpaper trail\b|\babsolutely true\b|\bdepends what you're comparing\b|\b(?:so|then) that's where he stands\b|\bjust a (?:project )?coordinator\b|\bdon't hire him\b|\bhe's not (?:the|your) (?:right )?(?:guy|person|candidate)\b/i;

// Gaps count only when the caller did not ask about them.
const GAP = /\b(?:no|not|hasn't|hadn't|never|doesn't|didn't|without|lacks?|isn't|wasn't)\b[^.?!]{0,40}\b(?:title|certif\w*|credentials?)\b/i;
const ASKED_ABOUT_GAP = /\b(?:title|certif\w*|credentials?|aws)\b/i;

const EARLY_CAREER = /\bearly[- ](?:career|in his career)\b|\bjunior\b|\bentry[- ]level\b|\bstill early\b/i;
const ASKED_ABOUT_EXPERIENCE = /\b(?:experience|experienced|senior|staff|years?|junior|new grad|better than|qualified|how long|early)\b/i;

const OVERCLAIM =
  /\b(?:exceptional|brilliant|world[- ]class|rock ?star|genius|best candidate|best engineer|perfect fit|incredibly talented|super talented|extremely talented|10x|guaranteed?)\b|\bhe's (?:already )?(?:an? )?(?:expert|senior[- ]level|staff[- ]level)\b|\bproduction systems at scale\b/i;

export const RUBRIC: Check[] = [
  { name: "undersell: none of the lines from Ariv's call", pass: (t) => replies(t).every((r) => !SELF_SABOTAGE.test(r.said)) },
  { name: "undersell: never volunteers a missing title or certification", pass: (t) => replies(t).every((r) => ASKED_ABOUT_GAP.test(r.user) || !GAP.test(r.said)) },
  { name: "undersell: early career only on experience questions", pass: (t) => replies(t).every((r) => ASKED_ABOUT_EXPERIENCE.test(r.user) || !EARLY_CAREER.test(r.said)) },
  { name: "oversell: no superlatives or inflated level", pass: (t) => replies(t).every((r) => !OVERCLAIM.test(r.said)) },
];
