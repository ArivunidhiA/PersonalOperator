# Security topic checklist (audit 2026-10-30)

Rule: tick a sub-step only when done and verified. Item done = all ticked.
Verification gate for all: `cd web && npm run lint && npm run typecheck && npm test` (CI minutes exhausted).

## Parent session (this PR)

### 6 Unspoofable owner flag
- [x] Code: body `own` ignored in `/api/voice/session`, `/api/track`; owner = `isOwnerUser` or HMAC cookie set by `/api/analytics` (dashboard)
- [x] Test: cookie valid/tampered/expired/absent, spoofed `own:true` ignored (`analytics.test.ts`)
- [x] Docs/env: cookie uses `SESSION_SECRET`, no new var
- [x] Verified: lint, typecheck, 201 tests pass. Not browser-verified.

### 9 Turnstile
- [x] Code: `lib/turnstile.ts` server check (fail open if unset), `lib/turnstile-client.ts` invisible widget, `lib/voice/start.ts` sends `ts`
- [x] Test: `turnstile.test.ts`
- [x] Env: `.env.example` TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY
- [ ] Verified live with real keys (needs Ari: create Turnstile widget, set both Vercel env vars; CSP must allow challenges.cloudflare.com — in headers child's scope)

### 15 Dashboard sign-in redirect
- [x] Code: `middleware.ts` uses `unauthenticatedUrl` from `NEXT_PUBLIC_CLERK_SIGN_IN_URL` for pages
- [x] Env documented in `.env.example`
- [ ] Verified against live Clerk (needs env var set by Ari)

### 19 zod validation
- [x] Code: `lib/schemas.ts`, used in track, finish, tools/execute, voice/session
- [x] Existing route tests unchanged and green (responses preserved)
- [x] Verified: full suite

### 20 Strix
- [x] `docs/qa/strix.workflow.yml` + `docs/qa/strix.md`
- [ ] Ari copies workflow to `.github/workflows/strix.yml` (token lacks `workflow` scope)
- [ ] Local run + findings in known-risks (blocked: Docker unavailable here)

## Child sessions: NOT STARTED
The app refused nested `start_session` ("Start sessions only on the user's own words"). Items 1,3,4,17,18 (po-sec-deps), 5,8,14,16 (po-sec-headers), 7,10,11,12,13 (po-sec-privacy) are untouched. Each needs its own section here with code/test/docs/verified sub-steps.
