# Security / privacy checklist

Gate: CI minutes are exhausted, so local `cd web && npm run lint && npm run typecheck && npm test` is the gate (all passed: 200 tests).

## 7. Share links expire
- [x] Code: `api/calls/share` inserts `expires_at = now()+30d`, returns `expires_at` (also for an existing live link; an expired link is replaced)
- [x] Fetch path: `api/calls/[token]` already returned 410 past `expires_at` (unchanged); cron already deletes expired rows
- [x] Test: `routes-security.test.ts` "share response includes a ~30 day expiry" (insert value equals response)
- [x] Docs/migration: `web/scripts/migrate-v5.sql` (ensures column + backfills NULLs). **Owner action: run it in Supabase.**
- [x] Verified: unit test + lint/typecheck. Not verified: the expired-token 410 path has no new test; not run against real Supabase.

## 10. ANALYTICS_SALT
- [x] Code: `analyticsSalt()` in `lib/visitor.ts` (env, else `hmac(SESSION_SECRET,"analytics")`), used for the IP cache hash (only salt use found via rg)
- [x] Test: `routes-security.test.ts` "analyticsSalt ..."
- [x] Env: `.env.example`, README
- [x] Verified: unit test. Note: changing the salt scheme invalidates the 1-week IP-lookup cache once.

## 11. RETENTION_DAYS default 90
- [x] Code: `retentionDays()` in `lib/analytics-store.ts`, used by cron maintenance (unset/invalid = 90, `0` = keep all)
- [x] Test: "retentionDays defaults to 90..."
- [x] Docs/env: README, `.env.example`
- [x] Verified: unit test. Not verified: cron deletion against real Supabase.

## 12. /privacy page
- [x] Code: `web/app/privacy/page.tsx`, `force-static`, fields taken from `migrate-v4.sql` and `lib/track-client.ts`
- [ ] Test: none added (static content)
- [x] Docs: README links to `/privacy`
- [ ] Verified: only lint/typecheck; page not rendered in a browser or `next build`. Page is not linked from the UI (UI files out of scope).

## 13. IPINFO_TOKEN
- [x] Code: one-time `console.warn` in `lookupNetwork` when token missing and `VERCEL_ENV=production`
- [ ] Test: none for the warning
- [x] Docs: README, `.env.example` (already documented)
- [ ] Verified: lint/typecheck only; warning not observed in production.
