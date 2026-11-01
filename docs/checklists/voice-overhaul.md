# Voice agent overhaul checklist (PM-held)

Started 2026-10-31. Ticked only after the PR is merged into `main` and the PM has verified it.
Evidence for the stress findings: `docs/qa/evidence/2026-10-31/adversarial-probe-d3bf74a.json`.

## Owner decisions (binding)
- The agent never volunteers that Ariv lacks a software engineer title or certifications. Those facts are what people screen on.
- Hyundai: Ariv did real software engineering work there as an intern. Say that. Only the title was different.
- Asked directly, it still never states anything false: no claimed title, no claimed certification. A direct question gets a short truthful line and an immediate pivot to the work.
- "Reasons not to hire him" gets his one real weakness (takes on too much), lightly, then a pivot. Never a list of gaps. No "that's not him".
- Never undersell. A little towards overselling is fine; invented facts are not.
- Off-topic gets no content, and a varied reply tied to the question ("I wish Ariv had trained me as a chef"). Emergencies are the only exception.
- English only (PM default until Ariv says otherwise). General AI questions only when tied to his work (PM default).
- Fewer prompt rules, more examples. Hard limits live in code.
- Transcript UI and live captions as described under W3 and W4. Must feel like Wispr Flow.
- Free tools by default. A paid service needs Ariv's approval.
- Added 2026-10-31: age 25. Tamil and English, plus survival-level Korean, French and Spanish. Work authorization: only "authorized to work", in varied wording, nothing further.
- Added 2026-10-31: captions must be free, built from open source projects, as close to Wispr Flow as measured. Audible audio is allowed for this work.
- Added 2026-10-31: he has used Rust, Kubernetes, Go, fine-tuning and model training. Technical depth comes from his public GitHub. Came to Boston for Northeastern in 2023; hardship told with grit, no invented specifics. Wants a fast team with direction and a full plate. Age, languages and hometown may be answered once the facts exist; internal company tasks, very personal and unrelated questions stay declined.

## File ownership (two writers never touch one file)
| Stream | Session | Owns |
|---|---|---|
| W1 Reliability | po-stall | `web/lib/voice/gemini.ts`, `openai.ts`, `start.ts`, `types.ts`, `vad-gate.ts`, `web/public/audio/*`, `web/lib/gemini-token.ts`; all of `voice-config.ts` except the prompt line |
| W2 Brain | po-brain | `web/lib/system-prompt.ts`, `knowledge.ts`, `agents.ts`, `tools.ts`, `tool-executor.ts`, `verifier.ts`, new `live-guard.ts`, `web/evals/*`, `docs/voice/*`, `app/api/voice/session/route.ts`, the prompt line of `voice-config.ts` |
| W3 Transcript UI | po-ui | `web/app/components/*` (includes `RealtimeVoice.tsx`, `TranscriptLog.tsx`), `web/app/globals.css`, `web/e2e/*.spec.ts` |
| W4 Live captions | po-stt | `web/lib/voice/transcript.ts`, new `web/lib/voice/live-caption*`, corpus tooling; privacy text via PM |
| W5 Independent QA | po-verify | No source edits. Reports only |

Anything outside your row goes through the PM.

## W1 Reliability (po-stall)
- [ ] 1 Reproduce the stall: long hesitant caller turn after a calendar tool call, then "Hello. Hello." with no reply
- [ ] 2 Root cause with evidence (watchdog gating, one-shot nudge, proactive audio silence, VAD, pending tool state, dropped events, turn state)
- [ ] 3 Freeze findings before editing
- [ ] 4 Failing regression test first, then the fix
- [ ] 5 A caller is never left in silence: recovery beyond one nudge, and a visible state if recovery fails
- [ ] 6 "Hello?" style check-ins always get a reply
- [ ] 7 Long disfluent turns are not cut off or lost (test VAD 500 to 800 ms against the corpus)
- [ ] 8 Session resumption: keep handles, reconnect on 1011 and goAway without losing context or the transcript
- [ ] 9 Duplicate spoken sentence after tool calls fixed ("I'll drop his calendar link" said twice)
- [ ] 10 `customVocabulary` for Ariv, INZI, forecost, Registrum, Malbit, Agno, NeMo Curator, pgvector
- [ ] 11 Phase 2 (after W2 merges): wire the live guard: cut audio on a confirmed hit, send a correction
- [ ] 12 Measured turn latency before and after, recorded in the PR

## W2 Brain (po-brain)
- [ ] 20 Rewrite the prompt: intent first (Ariv, this agent, hiring signal, small talk, off-topic, personal, attack), with good and bad examples, far fewer rules
- [ ] 21 Decode indirect intent ("RAG pipeline nobody owns", "I've got thirty seconds", "not that talented")
- [ ] 22 Hard scope: no content for off-topic (math, trivia, code, recipes), replies tied to the question
- [ ] 23 Per-call random sample of example lines, no verbatim canned lines across calls
- [ ] 24 Undersell fixes: every owner decision above; early-career mentioned only on experience questions and with a pivot
- [ ] 25 Fix replies from Ariv's call: "that's not him", "paper trail", the gap list, "Fair, depends what you're comparing him to", "absolutely", premature close on a doubtful caller, "who am I talking to" at the wrong moment, repeated "Fair" openers, ending turns with "what would you like to know"
- [ ] 26 Hyundai fact and `limits` fact rewritten; fact-embedded instructions moved out of FACTS
- [ ] 27 Unknown skill: "not in my notes", never "he hasn't used it"
- [ ] 28 Personal questions: warm deflect, no booking link
- [ ] 29 Jokes: several real ones, no refusal on "another one"
- [ ] 30 Gibberish: "didn't catch that", not the scope line
- [ ] 31 English-only behavior
- [ ] 32 Technical fact sheet (real stack, audio path, echo, checker, measured latency) from the code
- [ ] 33 Two-level knowledge: compact card inline, deep dossier in retrieval, synonyms, spoken variants, logged misses
- [ ] 34 `research_role` no longer pushes early-career every time
- [ ] 35 `docs/voice/ARIV_QUESTIONS.md`: exact questions for Ariv; nothing invented in the meantime
- [ ] 36 Verifier: no markdown or planning text, invented preference claims, non-English output
- [ ] 37 `web/lib/live-guard.ts`: high-precision pure check for live use; confidential terms reach the client hashed only
- [ ] 38 Add all 46 probe scenarios and Ariv's call as eval cases, plus scope, repetition and leak checks
- [ ] 39 Separate rubric for oversell and undersell (not self-graded)
- [ ] 40 Live evals x3 with results saved under `docs/qa/evidence/`

## W3 Transcript UI (po-ui)
- [ ] 50 Orb stays in its current position, before and during the call
- [ ] 51 No box around the conversation
- [ ] 52 Horizontal invisible strip under the orb holding only the latest user line and latest AI reply
- [ ] 53 Older text leaves the strip smoothly; no layout shift of orb or controls
- [ ] 54 Hover shows a fullscreen icon at the right corner (always visible on touch)
- [ ] 55 Icon opens a popup with the full conversation, live while the call runs
- [ ] 56 Popup: keyboard, focus trap, Esc, screen reader log, scroll stays pinned unless the reader scrolls up
- [ ] 57 Cards (links, booking, recap) stay reachable and clickable; define where they appear
- [ ] 58 Post-call panel, print and share still work
- [ ] 59 Phone width, desktop, reduced motion, a11y (axe), size budget
- [ ] 60 Screenshots for desktop and mobile in the PR

## W4 Live captions (po-stt)
- [ ] 70 Measure Gemini `inputTranscription` today: time to first word, update cadence, word error rate on the corpus
- [ ] 71 Compare free options (browser Web Speech, on-device Moonshine or Whisper on WebGPU, a second transcription stream) and paid ones for reference (Deepgram, AssemblyAI)
- [ ] 72 Answer the prediction idea with evidence: predicting unsaid words versus showing partial hypotheses
- [ ] 73 Pick one, with numbers; a paid pick stops for Ariv's approval
- [ ] 74 Target: first word under 300 ms, words appear as spoken, corrections settle without flicker, names right
- [ ] 75 Module and reducer support for replaceable partial text; final Gemini or better text wins; ordering tests
- [ ] 76 Echo: the agent's voice never appears as caller text
- [ ] 77 Fallback when unsupported (iOS Safari, Firefox): no crash, Gemini text still shows
- [ ] 78 Phase 2 (after W1 and W3 merge): wire into the call and the strip
- [ ] 79 CSP, privacy page, bundle budget updated if a new vendor or model is added
- [ ] 80 Numbers before and after in the PR

## PM follow-ups
- [x] 85 Update `docs/qa/QA_PROFILE.md`: English only, work authorization line replaces "ask Ariv"
- [ ] 86 After merge, run `npm run kb:seed` and confirm `kb:verify` (needs production write: confirm with Ariv)
- [ ] 87 Ariv to confirm where Rust, Go, Kubernetes, fine-tuning and model training were used (nothing public shows them)
- [x] 88 forecost status decided by Ariv: "alpha, in progress" (sent to po-brain)

## W5 Independent QA (po-verify, after W1 to W4 merge into an integration branch)
- [ ] 90 Full unit, route and UI tests
- [ ] 91 Live evals x3, old and new cases
- [ ] 92 Local E2E with fake mic, including Ariv's exact conversation
- [ ] 93 Spoken adversarial run through the audio path
- [ ] 94 Release report with one verdict
- [ ] 95 Production smoke after merge
