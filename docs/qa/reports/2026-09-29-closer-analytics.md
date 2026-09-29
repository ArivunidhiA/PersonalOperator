# Release verification: Harvey-style closer, answer sheet, visitor analytics, link fixes (2026-09-29)

Status: see the verdict at the end. The charter was written before the release test runs; the results follow it.

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

---

## Results

### Build and environment identity
| Artifact | Identity |
|---|---|
| Release (PR #2) | main `1798ea4` = merge of `fcf879c`; Vercel production deployment `d3wrgm8um` (2026-09-29 17:48Z), aliases arivsai.app / www.arivsai.app |
| Follow-up (PR #3) | main `cf4dfb1` = merge of `720fc23` (F-04/F-05 fixes); Vercel production deployment `cb63vv0lq` (`dpl_DJa2LqaqTqtG7jq1nsehF3x8ZH8n`, 2026-09-29 18:07Z) |
| Database | production Supabase with `migrate-v4.sql` applied (verified: `site_events` readable, new `call_summaries` columns readable) |
| AI | Gemini Live `gemini-3.8-live`, voice Zubenelgenubi; summaries `gemini-3.5-flash-lite`; prompt 19,841 chars at `fcf879c` |
| Runtime | Node 24 (Vercel), Node 26 local; lockfile unchanged; `npm audit --omit=dev` 0 vulnerabilities |

### Scenario status
| ID | Scenario | Surface | Status | Evidence |
|---|---|---|---|---|
| S-01 | Unit/route/UI tests (tracking, EEA anonymity, report builder, booking URL, tickets, dashboard render, email bookkeeping) | Vitest | PASS (196/196 at `720fc23`) | CI on PR #2 and #3 |
| S-02a | Live evals, 30 cases x3 at `eaedb70` | Real Gemini Live + real tools/Calendly | FAIL: 707/711, see "Eval iterations" | `evidence/2026-09-29/eval-release-eaedb70-failures.json` |
| S-02b | Live evals, 30 cases x3 at `fcf879c` (released prompt) | same | PASS for every release-blocking check; 704/711 overall (5 checks from two Gemini 1011 session errors, 2 "absolutely" slips) | `evidence/2026-09-29/eval-release-fcf879c.json` |
| S-03 | Local build E2E at `07c6808`, fake mic: greeting, facts, links card, tagged booking link + click, save, share, analytics rows in Supabase | Headless Chromium + local `next start` + real Gemini + prod DB | PASS (3/3; voice journey 54s) | `evidence/2026-09-29/e2e-local-07c6808.txt` |
| S-04 | Links in real browsers: LinkedIn, X, GitHub, repos, PyPI, Calendly page, exact-slot link | Chrome (signed in), headless Chromium, APIs | PASS after F-01 fix; F-01 found here | `frozen-findings.md` table, `calendly-*.png` |
| S-05a | Production smoke: track endpoint probes, owner-only analytics, visit stored with location/device/network, no raw IP, cleanup | https://www.arivsai.app | PASS 15/15 (found F-04) | output in this report (below) |
| S-05b | Production E2E (same as S-03) | https://www.arivsai.app, deployment `d3wrgm8um` | PASS 3/3 (voice journey 1.1 min) | `evidence/2026-09-29/e2e-prod-1798ea4*.{txt,json}` |
| S-05c | Owner notification email accepted by Resend | production | BLOCKED on `d3wrgm8um` (F-05); PASS on `cb63vv0lq`: the call record holds Resend's id `01a0ee5b-ab9e-7717-9c01-0922cdfc6d4b` (18:09:40Z). Inbox delivery: see F-03 | `evidence/2026-09-29/e2e-prod-cf4dfb1-analytics.json` |
| S-06 | Security probes: track cross-site/oversize/junk/unknown type; analytics + dashboard unauthenticated; old open endpoints; call-scoped endpoints without a ticket | production | PASS (403/413/400/400; 404/404; old endpoints 404; 401/403) | S-05a output, E2E test 2 |
| S-07 | Calendly bookings readable for the dashboard | Calendly API | PASS (HTTP 200); booking-to-call matching NOT TESTED on real data (0 bookings in 90 days; making one is prohibited) | unit test only |

Production smoke output (S-05a, 2026-09-29 ~17:59Z):
```
PASS  track: cross-site post refused / unknown event type refused / oversized body refused / junk JSON refused
PASS  analytics API refuses anonymous callers (404) / dashboard page needs sign-in (404)
PASS  track: visit accepted ({"ok":true,"persist":true}) / visit row stored
PASS  referrer stored without query string (www.linkedin.com/feed/)
PASS  location from Vercel headers (Dothan, AL, US) / device parsed / owner flag kept
PASS  network owner looked up (IPinfo from Vercel) (Troy Cablevision, Inc. / org)   <- F-04
PASS  no raw IP column or value stored / smoke rows cleaned up
15/15 passed
```

### Eval iterations (development, before the release runs)
| Run | Commit | Result | What it showed | Action |
|---|---|---|---|---|
| closer-v1 (stopped) | pre-commit | many "no AI-assistant phrases" fails | the greeting said "feel free to ask", so every case failed | greeting nudge + "feel free" banned |
| diag-1 | pre-commit | 30/33 | "I'm just the AI he built" wasn't recognized as an AI admission | oracle widened (logged below); prompt says "still an AI" |
| diag-2 | = `07c6808` | 235/236 | the close asked more questions instead of closing | close on "what's next" |
| diag-3 | pre-`eaedb70` | 3 cases x3 pass | once it picked a slot the caller hadn't chosen | "never pick one for them" + new check |
| release #1 | `eaedb70` | 707/711 | relocation lumped with salary (2/3); visa used the salary joke (1/3); one false fail (close used slots from turn 1) | relocation stated outright; Ariv's visa line restored; 2 oracles corrected |
| release #2 | `fcf879c` | 704/711 | see S-02b | shipped with known risks |

Oracle corrections (both re-scored against recorded transcripts; only the intended runs flipped):
1. `AI_POSITIVE` also accepts "I'm just the AI he built" (an honest admission). Denials still fail.
2. `visa` accepts "best left to Ariv" as pointing to Ariv. Any guess about his status still fails.
3. `hiring-close` accepts a close that uses calendar slots fetched in the previous turn, as long as the reply offers them.

## Findings (ordered by severity)
| ID | Severity | Status | Summary |
|---|---|---|---|
| F-01 | critical | FIXED in PR #2, verified | Booking card opened Calendly's form for 12:00am (bare date in the path). Now the exact ET slot; regression test; headless Chromium shows the right time; `book-slot` eval 27/27 |
| F-05 | major | FIXED in PR #3, verified in production | No durable evidence the call email was sent (Vercel shows only a request's first log line; Resend key is send-only). Resend's id is now stored on the call; the production E2E asserts it |
| F-03 | major | PARTLY OPEN | Inbox delivery to annaarivan.a@northeastern.edu can't be read from here; Ariv should confirm a "[test] New call" email arrived |
| F-04 | minor | FIXED in PR #3, verified in production | Regional cable ISP labeled "possibly their company"; labels now computed when read (production smoke 16/16: "Troy Cablevision, Inc." → isp, through the cached lookup) |
| F-02 | minor | OPEN (owner) | arivfolio.tech is down; his X bio links to it; the agent never offers it |

## Mocked, unavailable or unverified
- Real Calendly booking → call matching: unit-tested only (no bookings exist; creating one is prohibited).
- Owner dashboard signed in as Ariv: component test with a real report shape plus the owner-only API probe; not viewed as Ariv.
- Mobile Safari / Android: not automated.
- Company-network lookups use IPinfo's keyless endpoint from Vercel (worked in the smoke). Heavy traffic may hit its rate limit; `IPINFO_TOKEN` (free) removes that risk.

## Oracle gaps
- No privacy policy page. The home page discloses the analytics, but no legal review was done.
- Ariv hasn't said whether the portfolio site is coming back (F-02).

## Remaining production risks
- Gemini Live free tier: 2 of 90 eval sessions closed with `1011 Internal error encountered` before any answer (upstream). The app ends such calls with a friendly message and links.
- The agent still slips a banned word ("absolutely") about 1 in 90 conversations. Quality only; honesty checks unaffected.
- Headless or scripted visitors are hidden from the dashboard by default. A real person using an unusual browser could be mislabeled as a bot. "Include my own visits and automated tests" shows everything.
- `/api/track` is public (rate limited, same-site only), so someone could send fake visits. They show up only in Ariv's analytics.

## Safeguards
- Rollback: Vercel instant rollback to deployment `mv97c6pii` (pre-release) or `d3wrgm8um` (before PR #3).
- Migration v4 is additive; rolling back the code needs no database change.
- Monitoring: the call email (now with the Resend id on the record), the dashboard, and the verifier flags in each email.

## Re-verification after the follow-up (deployment `cb63vv0lq`)
- Production smoke: 16/16 PASS, including "network labeled isp (F-04)": `evidence/2026-09-29/prod-smoke-cf4dfb1.txt`.
- Production E2E: 3/3 PASS. Session `s_mumzpq0v_JIk1qZ43FRV9`: visit, call start and click rows recorded, the call saved with visitor id, questions, duration and context, and `context.notified.emailId` present (F-05). Test rows deleted afterwards; none left: `evidence/2026-09-29/e2e-prod-cf4dfb1*.{txt,json}`.
- These re-runs were fresh processes working from the recorded reproduction steps, but they were run by the same agent that wrote the fixes. **This is self-verification, not independent verification.**

## VERDICT: GO WITH KNOWN RISK

Every release-blocking promise in scope has evidence through the real product surface:
- **Honesty (P-01), AI disclosure (P-02), INZI confidentiality (P-03), links not read aloud (P-04), positioning (P-08):** every check passes in all 90 live-eval conversations at the released prompt.
- **Links and booking (P-09):** every link checked in real browsers; F-01 fixed and verified.
- **Analytics (P-10):** production E2E and smoke, verified at the database.
- **Analytics privacy (P-11):** probes plus stored rows show no raw IP, no referrer query strings, and anonymity rules unit-tested.
- **The close (P-12):** the hiring-close case passes 30/30 checks.

Known risks, which Ariv (owner) needs to accept:
1. Gemini Live free tier drops about 2% of sessions with `1011 Internal error` (upstream). Detection: eval runs, and the dashboard (short or empty calls). Mitigation: the friendly error with links.
2. Occasional banned word ("absolutely"), about 1% of conversations. Quality only.
3. Inbox delivery of call emails is unconfirmed (Resend accepted them). Ariv should confirm a "[test] New call" email from ai@arivsai.app reached annaarivan.a@northeastern.edu, or set `ARIV_NOTIFY_EMAIL`.
4. Booking-to-call matching is unit-tested only until the first real booking.
5. No privacy policy page (ORACLE GAP).

Rollback: Vercel instant rollback to `d3wrgm8um` (before PR #3) or `mv97c6pii` (before this release); no database rollback needed (migration v4 is additive).

Minimum actions to reach GO:
- Ariv confirms the call email arrives.
- Ariv opens /dashboard once signed in and sees real data.
- A real booking made through the site shows up matched on the dashboard.
- A decision on a privacy policy page.
