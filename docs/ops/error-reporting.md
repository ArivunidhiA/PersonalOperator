# Error reporting

## Current design
- `web/lib/report-error.ts`: `reportError(err, context)` POSTs to `/api/client-error` (beacon, max 5 per page load, deduped, 2 s gap).
- Table: `web/scripts/migrate-v5.sql` (`client_errors`, RLS on, service-role writes only). Run it in the Supabase SQL editor.
- Route spec (owner: po-security), `web/app/api/client-error/route.ts`: POST JSON `{message, stack?, context?, path?}`; rate-limit per IP (e.g. 20/10 min via `checkLimit`); same-origin check; truncate fields (message 500, stack 2000, context 100, path 200); insert into `client_errors` with `user_agent`; return 204; never throw; never log request bodies to third parties.
- Wiring (owner: po-design): `ErrorBoundary.componentDidCatch` and `window.onerror`/`unhandledrejection` call `reportError`.

## GlitchTip evaluation
- Hosted free tier: ~1,000 events/month, Sentry-SDK compatible, open source, 1 org. Self-hosting needs Postgres + Redis (not viable on Vercel Hobby).
- Pros: stack grouping, release tracking, alerts. Cons: SDK adds client bundle (~20-30 KB gz) against the 450 KB JS budget; free quota is small; another vendor holding user-agent/path data.
- Recommendation: stay with the own-table approach (zero bundle cost, data stays in Supabase). Revisit GlitchTip if volume of distinct errors justifies grouping/alerts.
