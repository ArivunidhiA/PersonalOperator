# QA Charter — voice overhaul (integration/voice-overhaul)

Written before testing. Verifier: po-verify session, did not write this code. Same model family as the authors, so "independent" means a separate session and no shared reasoning, not a separate person.

## Build identity
- Commit: d8abf643be23e5e67b782fd0a4c44850584f79e8 (branch integration/voice-overhaul). QA branch adds docs only.
- Lockfile: web/package-lock.json sha256 6b93bc20…5ee7
- Runtime: macOS (Darwin 27), Node 26.3.1 locally (Vercel is Node 24: mismatch recorded), local `next start`
- DB migrations: production Supabase, v5/v6 applied per MASTER
- Model: gemini-3.8-live (Live), prompt at the same commit, locked in the ephemeral token
- Flags: NEXT_PUBLIC_CLIENT_VAD unset (default)

## Change
Four streams: reliability (stall guard, resume/reconnect, goAway), brain (prompt/knowledge rewrite, live guard, verifier), transcript UI (strip, popup, card tray), live captions (Web Speech partials).
Affected promises: P-01, P-02, P-03, P-07, P-08, P-12, J-01..J-04, plus owner decisions in docs/checklists/voice-overhaul.md.
Blast radius: every call; gemini.ts is the only live call path.
Invariants: I-01..I-08, esp. I-04 (locked token) and token uses after adding reconnects; I-06 (no confidential names in repo, including evidence I commit).

## Scope decision
Deep: AI policy + prior incident (Ariv's stall) + token scope changed.

| Scenario | Why | Surface |
|---|---|---|
| Unit/type/lint/build | item 90 baseline, not product evidence | CLI |
| Live evals x3 all cases, typed | item 91, per-policy repeat | Real model + token, not audio path |
| voice-call.spec, transcript-ui, live-caption, a11y | item 92, never run on this work | Real browser, real Gemini, fake mic |
| Stall replay through audio | Owner's incident | Browser + fake mic with spoken file of Ariv's turns |
| Spoken adversarial with interruptions | item 93; typed text bypasses VAD/STT/guard | Browser + fake mic |
| Guard cut: audio played before cut | Owner promise; guard fires on text, audio leads | Browser, instrumented from outside the app |
| Barge-in, speaker echo with real sound | Unverified | Real speakers + real mic if available |
| Reconnect after forced drop; token limits | Token uses raised | Browser + direct WS |
| Captions on Chrome, fallback when absent | Owner promise | Real Chrome; headless may lack Web Speech |
| Lighthouse + size | Required | CLI |

Dependencies: Gemini Live real (shared free key: a rate-limited run is BLOCKED, never PASS). Calendly real read-only. Supabase production; test rows flagged is_bot and only my own rows deleted. Upstash real. Resend disabled by the local server env. Caller voices are synthetic (macOS `say`).

Exclusions and risk: real phones, human voices, real screen readers, Safari/Firefox real engines beyond what Playwright can drive. Item 95 runs after merge.

Safety: no real Calendly bookings, no third-party email, no confidential names in anything committed (evidence is redacted and grepped against BANNED_TERMS before commit), no source edits. Stop on any action that would touch non-test production rows.
