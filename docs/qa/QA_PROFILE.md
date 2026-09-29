# QA_PROFILE.md — Ariv's AI (arivsai.app)

Product-specific facts for the universal rules in `/AGENTS.md`. Promises come from Ariv (owner) directly; technical facts from the repo. `UNKNOWN` / `ORACLE GAP` mark what isn't established.

## 1. Product identity

- Product name: Ariv's AI (voice agent about Ariv)
- Repository: github.com/ArivunidhiA/PersonalOperator (public), app in `web/`
- Product owner: Ariv (Arivunidhi Anna Arivan)
- Release type: continuous; `main` auto-deploys to production on Vercel
- Production artifact: Vercel deployment of `main` for project `arivunidhias-projects/personal-operator`
- Deployment model: Vercel Hobby (serverless Node 24), git-connected; previews for branches
- Environments: local (`.env.local` from `vercel env pull`), Vercel Preview, Vercel Production
- Primary source of approved requirements: Ariv's instructions (2026-09-28 session) + `web/lib/knowledge.ts` for facts

## 2. Supported product surfaces

| Surface | Supported platforms or consumers | Real test interface | Release critical? |
|---|---|---|---|
| Web app (voice call) | Chrome/Edge desktop + Android, Safari macOS/iOS, Firefox | Preview/production URL in a real browser; `npm run test:e2e` (fake mic) | Yes |
| Share page `/call/[token]` | Any browser | Public URL | No |
| Owner dashboard `/dashboard` | Ariv only (Clerk) | Signed-in browser | No |
| Daily cron `/api/cron/maintenance` | Vercel Cron | Authenticated GET | No |

## 3. Critical promises

| ID | Promise | Source of truth | Release blocking? |
|---|---|---|---|
| P-01 | Everything the agent says about Ariv is true (current job, history, projects, skills); no invented numbers, titles or certifications | Ariv + `lib/knowledge.ts` | Yes |
| P-02 | The agent says it's an AI whenever asked, and never claims to be human | Ariv | Yes |
| P-03 | The agent never names, confirms or denies INZI Controls' customers, programs or parts | Ariv | Yes |
| P-04 | A caller can get Ariv's links and a booking link in the chat without URLs being read aloud | Ariv | Yes |
| P-05 | The site can't be used to email arbitrary people, read other callers' data, or burn Ariv's money | Ariv ("production ready", "free only") | Yes |
| P-06 | Voice runs on free tiers; paid providers only if explicitly enabled | Ariv ("only free tools") | Yes |
| P-07 | Tone: casual "chill guy who builds a lot", short answers, no corporate/AI-slop phrasing | Ariv | No (quality) |
| P-08 | Ariv is presented as inclined toward AI engineering, product management and software engineering, building every day; his INZI title (Client Project Coordinator) is never reduced to "just coordination" | Ariv (2026-09-28) | Yes |

## 4. Release-blocking journeys

| ID | Journey | Starting state | Expected end state |
|---|---|---|---|
| J-01 | Start call → greeting discloses AI → ask current job → correct INZI answer | Fresh visitor, mic allowed | Correct spoken answer + transcript |
| J-02 | Ask for LinkedIn/GitHub | Live call | Links card with working https links; no URL spoken |
| J-03 | Name a company + role, then ask to book | Live call | Honest fit answer; open slots offered; booking card links to Calendly |
| J-04 | End call (button or tab close) | Live call with ≥1 caller line | Transcript + summary saved once; share link works |
| J-05 | Visitor from EEA/UK/CH or quota exhausted | Any | Friendly message + links; no broken call |

## 5. Critical invariants

| ID | Invariant | Enforcement boundary | Evidence required |
|---|---|---|---|
| I-01 | No endpoint sends email to an address the caller chose (only Ariv, or the caller's own Clerk-verified email on request) | `/api/calls/*` server code | Route tests + E2E probes |
| I-02 | Tool/finish/email endpoints require a valid signed call ticket | `lib/session-ticket.ts` | Route tests + E2E probes |
| I-03 | No caller's stored data is returned to another caller | No lookup tool; share tokens 128-bit | Code + tests |
| I-04 | The prompt and tools can't be changed by the browser | Locked Gemini ephemeral token | Token probe (override ignored) |
| I-05 | Facts in prompt == facts in Supabase mirror | `npm run kb:verify` | Command output |
| I-06 | Confidential names never appear in the public repo | BANNED_TERMS env only | grep of tracked files + history |

## 6. Roles, ownership, permissions, privacy

- Roles: anonymous visitor; signed-in visitor (Clerk, optional); owner (Ariv, `ANALYTICS_OWNER_IDS`)
- Tenant model: single owner; visitors are not tenants
- Sensitive data: caller voice/transcripts, verified emails of signed-in callers, Ariv's contact info
- Privacy: Gemini free tier may use calls to improve Google products (disclosed in UI); transcripts stored in Supabase; retention via `RETENTION_DAYS` (UNKNOWN: Ariv hasn't chosen a period)
- Test accounts: UNKNOWN (no dedicated Clerk test user); agents must not sign in as Ariv
- Prohibited actions: sending real emails to third parties, booking real Calendly events, deleting non-test data
- Secrets never in output: all keys in `.env.local`; BANNED_TERMS values

## 7. Build and runtime

- Build: `cd web && npm ci && npm run build`; start: `npm run start`
- Runtime: Node 24 (Vercel), Node ≥22 locally; lockfile `web/package-lock.json`
- Env vars: `web/.env.example`
- Seed/reset: `npm run kb:seed` (safe swap), `npm run kb:verify`
- Health check: `POST /api/voice/session` returns 200 with a token (or 451/503 with a reason)

## 8. State and compatibility

- Stores: Supabase tables `conversations`, `call_summaries`, `share_tokens`, `callers`, `knowledge_base` (mirror), `caller_memories` (legacy, unused)
- Cache: Upstash Redis (rate limits, role-research cache, finish lock)
- Share links from before this release keep working (same table/columns)
- Reconnect: a dropped call ends gracefully and is saved; no mid-call resume
- Data-loss tolerance: a call that ends by crash without pagehide may not be saved (accepted)

## 9. Integrations

| Integration | Purpose | Real sandbox? | Mock allowed? | Required failure behavior |
|---|---|---:|---:|---|
| Gemini Live API | Voice (critical path) | Real free tier | No (evals/E2E use real) | Friendly error + links |
| Gemini text API | Role research, summaries | Real free tier | Yes in unit tests | Deterministic fallback text |
| Calendly API | Open slots | Real (read-only) | Yes in unit tests | Share booking link instead |
| Supabase | Storage | Production DB only | Yes in unit tests | Call works; save may fail with message |
| Upstash | Rate limits | Real | Yes | Fail closed in prod if unconfigured |
| Resend | Emails to Ariv / opt-in transcript | Real | E2E disables | Silent skip |
| Clerk | Optional sign-in | Real | Yes | Anonymous still works |
| OpenAI Realtime | Optional paid fallback | Real (paid) | — | Off by default |

## 10. Execution matrix

- Browsers: Chrome desktop (automated), Safari iOS / Chrome Android (manual, ORACLE GAP: no device automation here)
- Locales: English-first; other languages only if the caller speaks full sentences
- Timezones: slots shown in US Eastern
- Screen sizes: 375px mobile to desktop
- Accessibility: UNKNOWN standard; basics required (labels, live regions, contrast)

## 11. AI-specific profile

- Promises: P-01..P-04, P-07
- Provider/model: Gemini `gemini-3.8-live` (voice), `gemini-3.5-flash-lite` (text); optional OpenAI `gpt-realtime-2.1-mini`, Claude via AI Gateway
- Prompt version: `web/lib/system-prompt.ts` + `web/lib/knowledge.ts` at the release commit
- Retrieval: in-memory keyword search over the fact registry (no embeddings at runtime)
- Tool permissions: `web/lib/tools.ts` (no email, no caller lookup)
- Grounding rule: only facts in `lib/knowledge.ts`; numbers only from `ALLOWED_NUMBERS`
- Refusal rules: INZI confidentiality; visa/salary/personal → "ask Ariv"
- Injection surfaces: caller speech; tool inputs (company/role strings)
- Historical failures: see `docs/qa/reports/2026-09-28-honest-free-agent.md` (real transcripts)
- Evaluator: deterministic checks in `web/evals/cases.ts` + `lib/verifier.ts`; no LLM judge
- Repeat count: ≥2 per case per release, ≥3 before a prompt change ships
- Max latency: time to first audio ≤ 2 s for a factual question (target)
- Max cost: $0 (free tiers)
- Unavailable model/tool: friendly message, links card, no dead air

## 12. Operational thresholds

- Daily session cap: `DAILY_SESSION_CAP` (default 200)
- Logs: structured JSON via `lib/logger.ts` (Vercel logs keep ~1 h on Hobby)
- Monitoring: call notification email includes automatic fact-check flags
