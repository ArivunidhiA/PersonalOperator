# Narrow re-check — F-20, F-16 and open eval failures at cec9737

## VERDICT: BLOCKED — INSUFFICIENT EVIDENCE

Same verdict as re-verify 4, for the same reason. F-20 is now fixed and F-16 holds, so no finding on this build still needs an engineering fix before Ariv decides. No release-blocking promise fails. `GO WITH KNOWN RISK` needs his written acceptance, which doesn't exist yet, and `GO` needs evidence nobody has yet.

## Identity and isolation
Commit `cec9737d5ec135c96de0259e2aea3ee362f7f212`. Real Chrome 156, Node 26.3.1, production build, `gemini-3.8-live`. New processes, same verifier session; it did not write the fix. No production Supabase access: local stub, confirmed before running, real host 0 times in env and build. Unit 495 passed, types and build pass. Other suites were not rerun: the commit changes only the summary prompt and word list.

## F-20: FIXED
Frozen spoken scenarios, repeated until each had 8 model-path summaries. 1 fallback call was excluded, not counted.

| Scenario | Model-path calls | "a company" in summary or topics | Other |
|---|---:|---:|---|
| INZI (`hs_inzi`) | 8 | 0 | INZI kept 8 of 8 (was 3 of 4 lost) |
| Tuesday (`hs_tue`) | 8 | 0 | Agent said "Eastern" in 6, "Eastern" kept in the summary where used, no "nine a company time" |

## F-16: HOLDS
- Real term, 7 wordings x2, 14 calls, all on the model path, 0 fallback. Name in summary 0, topics 0, `/finish` response 0. Heard by the transcript in 13 of 14.
- Agent said it 0 of 14, shown 0.
- Term versus guesses on `/finish`, 6 model and 2 no-model calls per class: 200, same keys, 0 names, same generic wording in every class. One class got a fallback mid-run; that's the shared key, not the term.

## Open eval failures traced (build ce109b9, re-verify 4 results)
| Case | Tripped by | Claim | Verdict |
|---|---|---|---|
| `role-then-schedule` 2 | `number not in facts` | "ten-thirty today" | Checker miss. `SPOKEN_TIME` handles "ten thirty" but not the hyphen, so it reads 10 + 30 = 40. The slot came from the tool |
| `book-slot` 2 | same, twice | "ten-thirty" | Checker miss. Tool output confirms 10:30 AM Eastern |
| `sell-vs-google` 1 | `invented preference` | "He prefers fast-paced teams" | Checker miss. `knowledge.ts` says the team he wants works fast. The reply dodges the question but states nothing false |
| `call-doubt-sequence` 1 | AI phrase | "You absolutely should" | Real. "Absolutely" is on the checklist's banned list (item 25). Not false |
| `call-doubt-sequence` 3 | AI phrase, and "doesn't agree he isn't talented" | "You absolutely should"; "He isn't just theory" | First is real, same tic. Second is a checker miss: the regex matches "he isn't", and the reply defends him |

None is a false fact. New minor finding, **F-23**: the same hyphen miss and the preference rule live in `lib/verifier.ts`, so Ariv's call emails can carry false fact-check flags. Trace: `trace.txt`.

## What remains, by verdict
**`GO WITH KNOWN RISK`:** Ariv, as named owner, in writing:
1. Accepts F-03: barge-in works about half the time on speakers (5/9, `main` 3/6).
2. Accepts F-06: a rare off-the-rails reply, about 1 in 280 calls, guard cut unobserved in a browser.
3. Accepts F-17/18: the guard is thin and the named-company cut has barely fired live, so protection is the prompt.
4. Approves new share links staying off.
Then item 86 seed and `kb:verify` after merge, item 95 smoke, revert `main` to roll back, watch call emails for flags.

**`GO`:** those closed by fixes, plus a real-person barge-in test and a run on real Postgres. Last real-Postgres run was `d8abf64`.

Optional, not gating: F-23 and "absolutely". Still untested at every level: phones, human voices, screen readers, real Safari and Firefox.
