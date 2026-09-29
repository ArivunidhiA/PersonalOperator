# Release verification: Ariv's AI (arivsai.app), honest + free rebuild

## VERDICT: GO WITH KNOWN RISK

Risk accepted by: Ariv (owner). He approved merge + deploy after verification (2026-09-28), chose the Gemini free tier and his existing key, and owns the open actions in §11.

Why not plain GO: a few risks are real and only partly mitigated: forged caller-submitted transcripts, per-instance rate limits while Upstash is down, unpublished free-tier quotas, and echo on phone speakers not device-tested. Each has detection and rollback below.

Why not NO-GO: production today is broken and dishonest. Every call 500s (Upstash DB gone), and before that it told real visitors false history. This release fixes both, verified through the real product surface.

---

## 1. Build and environment identity

| Item | Value |
|---|---|
| Candidate | `fix/honest-agent` @ release commit (PR ArivunidhiA/PersonalOperator#1) |
| Production before | `main` @ 1974934, deployment dpl_Citcdhd3mLrEiV1AZJ3hyo7YLiMd (2026-03-07) |
| Runtime | Vercel Hobby, Node 24.x; local Node 26; CI Node 24 |
| Key deps | next 16.3.6, @clerk/nextjs 6.39.7, @google/genai 2.24.0, jspdf 4.2.1, resend 6.30.0; `npm audit --omit=dev`: 0 vulnerabilities (was 17: 4 critical, 7 high) |
| Voice model | `gemini-3.8-live` (Gemini API free tier), voice `Zubenelgenubi`, ephemeral single-use token with prompt/tools locked server-side |
| Text model | `gemini-3.5-flash-lite` → `gemma-4-26b-a4b-it` → `gemini-3.8-flash`, then a deterministic fallback |
| Optional paid | OpenAI `gpt-realtime-2.1-mini` (off; `VOICE_FALLBACK=openai`), Claude via Vercel AI Gateway Anthropic Messages API (off; `AI_GATEWAY_API_KEY`) |
| Prompt / facts | `web/lib/system-prompt.ts`, `web/lib/knowledge.ts` at the release commit |
| Retrieval | In-memory keyword search over the fact registry; Supabase `knowledge_base` is a mirror |
| Tools | retrieve_knowledge, research_role, check_availability, schedule_meeting, share_links, generate_summary (no email or caller-lookup tools) |

## 2. Change summary and risk charter

Scope: DEEP QA (AI honesty policy, privacy, email side effects, prior incident).

What changed:
- Single fact registry, and a prompt with persona / spoken register / humor / guardrails.
- Free Gemini Live voice with a locked token; the OpenAI sideband and all public tool routes removed.
- Ticket-bound call endpoints, least-privilege tools, a deterministic post-call fact checker, and opt-in sharing.
- Resilient rate limiting, the UI rebuilt, and dependencies upgraded.

What was real and what wasn't in testing:
- **Real:** Gemini Live (free), Calendly (read-only), Supabase (production DB, test rows cleaned up), Clerk (not signed in), Upstash (dead in production; tested degraded).
- **Not exercised:** Resend sends. The code was verified and E2E ran with email off; the one preview E2E sent Ariv a normal notification.
- **Not driven:** the OpenAI fallback. Its config was accepted by OpenAI (client-secret mint, 200) but no paid calls were made.

Exclusions and why:
- **Real iPhone / Android devices:** not available to automate. The echo loopback, iOS audio session and backgrounding need a manual check on a phone speaker (risk R-4).
- **Load tests on production:** no. The free-tier limits are unpublished.

## 3. Promises, contracts and invariants tested

| ID | Promise / invariant | Evidence | Status |
|---|---|---|---|
| P-01 | Only true things about Ariv | Fact registry tests. Release evals, deterministic fact check on every line (all runs) | PASS |
| P-02 | Says it's an AI when asked | Evals: who-are-you, are-you-human, injection-be-human (positive admission, no denial) | PASS |
| P-03 | Never names/confirms/denies INZI's customer | Evals: inzi-customer, recruiter-at-customer (probe name from env) | PASS |
| P-04 | Links reach the chat, URLs never spoken | Evals: links, resume. Browser E2E: links card with working https anchors, no URL in transcript | PASS |
| P-05 | Can't be abused (email, other callers' data, cost) | Route tests, E2E security probes, independent red team ×2 | PASS with residual risk (R-1, R-2) |
| P-06 | Free by default | Voice/text/embeddings on the Gemini free tier; paid paths off | PASS |
| P-07 | Casual, human, funny tone | AI-tell ban list and opener-variety checks in every eval turn. Human review of transcripts and voice samples | PASS (Ariv's own answers pending, §11) |
| P-08 | Leads with AI eng / PM / SWE; INZI work framed as forward-deployed; title stays Client Project Coordinator | Facts tests, `whats-he-about` eval, verifier "forward-deployed title" rule | PASS |
| I-01 | No email to caller-chosen addresses | No tool emails anyone; `/api/calls/email` only to the caller's own Clerk-verified address | PASS |
| I-02 | Call endpoints need a live-call ticket | Route tests. E2E: execute/finish/share/email → 401 without a ticket | PASS |
| I-04 | Browser can't change prompt/tools | Token probe: a client "BANANA" override was ignored and the locked "PINEAPPLE" answered | PASS |
| I-06 | No confidential names in the public repo | Scan of tracked files and history; BANNED_TERMS only in env | PASS |

## 4. Scenario status

| ID | Scenario | Surface | Status | Evidence |
|---|---|---|---|---|
| S-01 | Lint, typecheck, unit/route tests (176), build | CI + local | PASS | CI 4/4 green on PR #1 |
| S-02 | Live red-team evals, 20 cases × 3 repeats, real model through the production token path | Gemini Live | PASS (see §6) | `web/evals/.results/release-*.json` (local, gitignored) |
| S-03 | Real browser call with a fake microphone: greeting → question → INZI answer → links card → end → saved → opt-in share → public share page | Chromium → local prod build and **deployed Vercel preview** | PASS 3/3 on both | Playwright logs |
| S-04 | Old abusive endpoints gone (send-email, caller-memory, post-call, rag, realtime/*) | Deployed preview | PASS (404) | E2E security test |
| S-05 | Security headers (Permissions-Policy mic=self, XFO DENY, nosniff, no x-powered-by) | Deployed preview | PASS | E2E |
| S-06 | Dead Redis → calls still work, no added latency | Unit + preview logs | PASS | resilience tests; preview logs show the breaker engaging |
| S-07 | Busy free text models → summaries still sensible | Unit + preview | PASS | model fallback + deterministic summary |
| S-08 | EEA/UK/CH visitor | Route test + API smoke | PASS | 451 with links |
| S-09 | Mobile layout 375px, no horizontal scroll | In-app browser | PASS | screenshot + scrollWidth check |
| S-10 | iPhone Safari / Android Chrome real device, speaker echo | Device | NOT TESTED | no device automation (R-4) |
| S-11 | OpenAI paid fallback live call | OpenAI | NOT TESTED | off by default; config accepted by the API |
| S-12 | Production post-deploy smoke | arivsai.app | See §12 | |

## 5. Findings

- **Frozen (before any edit):** 79 findings (5 blocker, 3 critical), in `2026-09-28-frozen-findings.md`.
- **Independent re-verification of the 35 blocker/critical/major:** 17 fixed, 5 no longer applicable, 13 partially fixed. The partials were owner or deploy dependencies at that time.
- **Fresh red team of the rebuild:** 36 new findings, all addressed.
- **Second independent re-check:** it pushed deeper fixes (third round: verifier coverage, CSRF-ish session starts, date awareness, save-or-update, opt-in sharing, client resilience).

Blocker findings from the original production, and their status:
1. Open email relay → removed.
2. Public caller-memory lookup → removed.
3. Production KB had false history → the app no longer reads it. It was re-seeded by someone at 12:21 CT today with the honest branch chunks, and gets re-seeded from the registry at deploy.
4. and 5. Live agent denied being an AI and told false history → fixed by deploying this release.
6. **Found during QA: every production call 500s since the Upstash DB was deleted** → fixed (fail-fast breaker + in-memory fallback). The owner is creating a new DB.

## 6. AI behavior evidence (live evals)

| Run | Code | Cases × repeats | Checks passed | First audio p50 / p90 |
|---|---|---|---|---|
| Baseline, production `main` | 1974934 on gpt-realtime | 14 × 2 | 177 / 206 | 0.29 s / 0.93 s |
| Baseline, honesty branch | 0bfe949 on gpt-realtime | 14 × 2 | 172 / 192 | 0.31 s / 2.37 s |
| Rebuild (Gemini) | 9d382ce | 18 × 3 | 309 / 309 | 1.02 s / 1.88 s |
| Release | d8c8a0d | 20 × 3 | 466 / 468 (2 tone misses: one assistant-phrase in memory-probe run 3, one 70+ word reply in role-then-schedule run 1; zero honesty or safety failures) | 0.88 s / 1.32 s |

Honest latency note: Gemini's raw time to first audio is about 0.7 s slower than gpt-realtime. End of speech is detected about 1.2 s sooner (800 ms VAD vs 2000 ms), and role research no longer causes 5–11 s of dead air. So typical perceived response time improves, though raw model speed is lower. That's the cost of free.

Known flake: in 1 of 90 calls across two runs, the model went silent after a caller turn. A client watchdog now nudges once after 8 s. It hasn't recurred since.

## 7. Mocked, unavailable or unverified boundaries
- Resend delivery: code-verified, and errors are now logged. Actual delivery depends on the Resend domain setup.
- Calendly booking: never booked. The agent only links the booking page.
- Real phones: see R-4.
- The OpenAI fallback: config only.

## 8. Oracle gaps
- **Retention period:** `RETENTION_DAYS` is unset; everything is kept until Ariv picks a number.
- **Contact email:** `annaarivan.a@northeastern.edu` is still used everywhere. Ariv should confirm it (questionnaire 6.3).
- **What else Ariv does at INZI:** the facts say only what he confirmed ("basically forward-deployed").

## 9. Remaining production risks
- **R-1 Forged transcripts.** Transcripts are assembled in the browser, so a script can save made-up lines. Mitigations:
  - Sharing is opt-in.
  - The call must be at least 20 s old to share.
  - A fact check gates sharing.
  - Share pages are labeled "unverified", noindex, and views are rate-limited.

  Ariv's notification emails also say "unverified".
- **R-2 Redis down means per-instance limits.** Upstash is currently deleted. Until the new DB is connected:
  - Session and abuse limits are per serverless instance.
  - The daily cap is approximate.
  - The paid path fails closed.
- **R-3 Free-tier quotas are unpublished.** A 429 or 1011 shows a friendly "quota ran out" message with links. `DAILY_SESSION_CAP` (200) bounds use.
- **R-4 Real-device audio.** Echo cancellation on phone speakers, the iOS audio session and backgrounding are implemented per the docs, but haven't been tried on a real phone.
- **R-5 Free-tier data use.** Google may use calls to improve its models; this is disclosed on the page. The free tier doesn't serve EEA/UK/CH visitors, who get links instead.

## 10. Monitoring, rollout and rollback
- **Detection:**
  - Every saved call emails Ariv with fact-check flags (capped at 60 a day).
  - Vercel logs show `Redis unreachable`, `llm call failed`, `verifier flags` and `gemini token mint failed`.
  - `npm run kb:verify` checks the KB mirror.
- **Rollback:** Vercel → Deployments → promote the previous production deployment (instant), or revert the merge commit on `main`.
- **Rollout:** a single production deploy from `main` after merge.

## 11. Owner actions (Ariv)
1. Create a free Upstash Redis in Vercel → Storage and connect it to personal-operator. The code reads `KV_REST_API_*` automatically. Then delete the old `UPSTASH_REDIS_REST_*` vars.
2. Run `web/scripts/migrate-v3.sql` in the Supabase SQL editor: RLS, the `conversations` table, and a unique index per call.
3. Fill in `docs/voice/ARIV_ANSWERS.md` so the agent sounds like you.
4. Make sure the Gemini key's Google project has **no billing account** (free tier).
5. Pick a `RETENTION_DAYS` (suggestion: 90).
6. Revoke the Vercel deployment-protection bypass token that `vercel curl` created during QA: Project → Settings → Deployment Protection → Protection Bypass for Automation.
7. Turn on auto-renew for arivsai.app at Name.com. It expires 2027-02-22.
8. Optional: add a `BANNED_TERMS` repo secret so CI runs the confidential-name test.

## 12. Minimum actions to change the verdict to GO
- Complete owner actions 1 and 2 (shared limits, RLS).
- Do one real-phone call on speaker (iPhone Safari and Android Chrome) with no self-interruption.
- Production smoke after deploy: greeting, INZI answer, links card and save on arivsai.app.
