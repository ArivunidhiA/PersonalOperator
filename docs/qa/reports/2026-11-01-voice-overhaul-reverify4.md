# Re-verification 4 — F-20, F-21, F-22 at ce109b9

## VERDICT: BLOCKED — INSUFFICIENT EVIDENCE

No release-blocking promise fails on this build, so this is no longer `NO-GO`. It can't be `GO`, because barge-in is unproven with a real person and is flaky on speakers. It can't be `GO WITH KNOWN RISK`, because that requires a named person to accept the risks and Ariv hasn't. What's missing is his decision, not more engineering, apart from one small summary defect (F-20).

## Identity and isolation
Commit `ce109b9e72fe86fdaffad6fefdf3c968ed5ad1b9`. Real Chrome 156, Node 26.3.1, production build, `gemini-3.8-live`. New processes, same verifier session; it did not write the fixes. No production Supabase access: local stub, confirmed before running, real host 0 times in env, build and evidence. Saved rows come from the stub.

## Results

| Finding | Result | Evidence |
|---|---|---|
| F-22 | FIXED. `hire` 0 of 12 spoken, all wordings 0 of 36 on the real term: said, audible, shown, saved. Name heard by the transcript in 27 of 36. Evals 0 of 288, `recruiter-hiring-at` 3/3 | `leak5.json` |
| F-16 | Holds. Real term in 0 of 36 summaries, topics, `/finish` | same |
| F-21 | FIXED. Fallback is now a count ("Caller asked a question."), no quote, no name at route level for term or guess | `oracle.txt` `scrub.txt` |
| F-20 | NOT FIXED. See below | `honest.txt` |

Caveat on the matrix: the text models timed out or hit 429 on the shared key for part of the run, so 18 of the 36 real-term summaries are fallback. The other 18 are the model path, 0 names. A blocked model isn't counted as a pass beyond those 18. The route comparison was rerun after recovery.

### F-20: minor, still open
Of 12 honest calls:
- "Nine Eastern" came out as "nine a company time", 1 of 2 (`Eastern` isn't allowed; "9 AM" itself is fixed).
- His employer came out as "at a company", 3 of 4 INZI calls. The scrub no longer does this offline, and no caller company was logged, so the likely cause is the model following "say their company" (hypothesis).
- A misheard "Rust" ("ROS") became "a company": fair behaviour on a bad transcript.
- Offline: Denver, Toronto, Angular, Laravel, Svelte, Spring, EST, and a caller's first name when not extracted.
Not a privacy or P-03 issue. Caller-visible wording only.

## Term versus guesses: PASS
| Route | Result |
|---|---|
| `/finish`, model path, 6 per class | 200, same keys, 0 name, "a company" or generic text in every class |
| `/finish`, no model, 2 per class | Identical text in all classes |
| share, email, tools | As before: no term dependence |
| Live speech | 0 mentions for the term, fictional and carmaker classes |

Same limits: signed-in email and old-link routes not exercised.

## False cuts
Live: 0 of 27 honest calls, including volunteer roles, role wanted, Hyundai and Serotonin. 0 of 317 eval replies. 0 cuts of any kind in the matrix. The rule never fired this run, so its live cut is not exercised.

Offline the guard stays thin: 6 of 9 cut-worthy honest wordings outside his main employers trip it, e.g. "His role at Crossroads of Michigan", "a role at AI-first companies". 10 of 14 leak wordings pass. A non-auto company in his notes got "He hasn't been employed at [NAME]" uncut, 1 of 9.

## Regression
| Check | Result |
|---|---|
| Unit | PASS 495/495 |
| Types, build | PASS |
| `voice-call` + `transcript-ui` | PASS 25/25 once, DB on the stub |
| Evals x3, 96 cases, 288 calls | 4886/4899, 10 calls with a failure, 0 blocked, first audio p50 885 ms. Prompt-related cases all pass |
| Stall replay | PASS 8/8, 1.0 to 1.6 s. Cut 3 to 6 per gapped, 1 tight, no nudges. Booking pushed 1/5 |
| Lighthouse, size, a11y | PASS. 0.93, 157.53 of 180 kB, 3/3 |
| Token | PASS. 4th and 5th use refused, overrides ignored |
| Reconnect kills | PASS 4/4 scenarios |

Three eval fact-check failures (`role-then-schedule` 2, `book-slot` 2, `sell-vs-google` 1) and `call-doubt-sequence` 3 were not traced to a rule. A real 1011 hit `ind-busy` 2, the fourth in about 1,130 sessions; the app's handling of a real one is still unobserved.

## Evidence still missing
Real-person barge-in. F-06 rate in the browser. Real Postgres on these commits (last real run: `d8abf64`). Real speakers on this build (audio path unchanged since `main`-level control). Real network loss. Phones, human voices, screen readers, real Safari and Firefox. Item 95.

## What remains, by verdict
**`GO WITH KNOWN RISK`:** Ariv, as named owner, in writing:
1. Accepts F-03: barge-in works about half the time on speakers (5/9, `main` 3/6).
2. Accepts F-06: a rare off-the-rails reply, about 1 in 280 calls, guard cut unobserved.
3. Accepts F-17/18: the guard is thin, so protection on company names is the prompt.
4. Approves new share links staying off.
5. Accepts F-20 or has it fixed (`Eastern` is a one-word fix; the INZI wording needs a look).
Plus the plan already stated: item 86 seed and `kb:verify` after merge, item 95 smoke, revert `main` to roll back, watch call emails for flags.

**`GO`:** all the above closed by fixes, plus a real-person barge-in test and a run against real Postgres.
