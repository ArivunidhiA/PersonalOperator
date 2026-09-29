# Release verification: Harvey-style closer, answer sheet, visitor analytics, link fixes (2026-09-29)

Status: IN PROGRESS (charter written before the release test runs; results below are filled in as they come).

## Charter

### Build identity
- Branch `feat/closer-analytics` from `fix/honest-agent` (= `origin/main` 8a7925e content); commit SHA recorded in the results section.
- Runtime: Node 24 on Vercel (prod), Node 26 locally; `web/package-lock.json` unchanged.
- Migration: `web/scripts/migrate-v4.sql` applied to production Supabase on 2026-09-29 (additive; verified with the service role: `site_events` exists, new `call_summaries` columns readable).
- AI: Gemini Live `gemini-3.8-live`, voice Zubenelgenubi; prompt = `web/lib/system-prompt.ts` + `web/lib/knowledge.ts` at the commit (19,854 chars, budget 20,000).

### What changed
1. Agent voice: Ariv's 2026-09-29 answer sheet (his lines, answer-evidence-personality-stop, show don't sell, humor rules), a Harvey Specter style close (one sharp question, evidence, offer the calendar once, no hype or fake urgency), may ask once who the caller is (never email or phone).
2. Facts: relocation, real weakness, how he works, current projects, free time, forecost burn rate. Inflated resume metrics from the sheet were NOT added (see `docs/voice/ARIV_ANSWERS.md`).
3. Visitor analytics: `/api/track` (visits, clicks), `call_start` events, per-call context (location, network owner, source, device, duration, what they said, who they said they are), Calendly booking matching via UTM tags, owner dashboard rebuilt, richer notification email, owner/bot filtering, EEA/UK/CH anonymous, GPC/DNT respected, 90-day retention.
4. Fix for F-01 (booking card opened Calendly at 12:00am): the card now links to the exact slot.

### Promises and invariants in scope
P-01, P-02, P-03, P-04, P-07, P-08 (unchanged, re-checked because the prompt changed), P-09 links, P-10 analytics, P-11 analytics privacy, P-12 closer; I-01..I-08; journeys J-01, J-02, J-03, J-04, J-06.

### Blast radius
Every call (prompt), the session start and call save routes (analytics writes, must never break a call), every page view (tracker), the dashboard.

### Depth: standard
The prompt change touches release-blocking honesty promises (P-01..P-03, P-08), and analytics touches privacy, so smoke alone isn't enough. Not deep: no auth or payments changed beyond the owner-only dashboard route, which keeps its existing guard.

### Scenarios and why
| ID | Scenario | Why |
|---|---|---|
| S-01 | Unit/route tests (tracker validation, EEA anonymity, report builder, booking URL, ticket) | lowest reliable layer for the new logic |
| S-02 | Live evals, all 30 cases x3, real Gemini + real tools + real Calendly | prompt change; nondeterministic; P-01..P-03, P-08, P-12 |
| S-03 | Local build E2E, fake mic: greeting, facts, links card, booking link + click, save, share, DB analytics rows | assembled product, J-01/J-02/J-04/J-06 |
| S-04 | Link checks in real browsers (LinkedIn, X, Calendly day + exact-slot pages) | P-09; bots are blocked by LinkedIn/X |
| S-05 | Production smoke after deploy: same E2E against arivsai.app, notification email accepted by Resend, owner-only analytics API | release artifact, not just the local build |
| S-06 | Security probes: track endpoint cross-site/oversize/junk; analytics API unauthenticated | new public endpoint |

### Real vs mocked
Real: Gemini Live, Calendly (read-only), Supabase (production DB; test rows flagged `is_bot` and deleted after), Upstash (prod only), Resend (prod only; local E2E disables email). Mocked only in unit tests: Clerk, Supabase writes for `/api/track`.

### Exclusions and the risk they leave
- No real Calendly booking (prohibited): booking-to-call matching is unit-tested against Calendly's documented invitee shape only.
- Owner dashboard UI can't be viewed signed in as Ariv (agents must not sign in as him): the API's auth is probed and the report builder is unit-tested; Ariv should open /dashboard once.
- Inbox delivery of the notification email can't be read (send-only key): Resend acceptance (email id in logs) is the evidence.
- Mobile Safari / Android: not automated here (unchanged risk from the last release).

### Safety and stop conditions
No emails to third parties; no real bookings; delete this run's test rows only; stop if a release-blocking honesty check fails at the release run.
