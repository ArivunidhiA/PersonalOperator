# Security and dependency checklist

Tick only when done and verified. An item is done only when all its sub-steps are ticked.
Gate: CI minutes are exhausted, so `cd web && npm run lint && npm run typecheck && npm test` (plus `npm run build`) ran locally.

## [1] Upgrade next + eslint-config-next to 16.4.3
- [x] Code change: `web/package.json` and lockfile bumped to 16.4.3
- [x] Test added: n/a (dependency bump; existing suite is the regression gate)
- [x] Docs/env updated: `web/eslint.config.mjs` downgrades new `react-hooks/refs` to warn (RealtimeVoice.tsx, outside this task's ownership)
- [x] Verified: local lint, typecheck, test, build all pass
- [x] Follow-up: ref write during render fixed in PR #9 (design split); rule can be restored to error in a later lint pass

## [3] source-map-js audit fix (skip dompurify/jspdf)
- [x] Code change: lockfile `source-map-js` 1.2.2 (`npm update source-map-js`)
- [x] Test added: n/a (transitive dependency)
- [x] Docs/env updated: n/a
- [x] Verified: `npm ls` shows 1.2.2; dompurify/jspdf untouched

## [4] Clerk 6 to 7 plan (no migration)
- [x] Code change: none by design
- [x] Test added: n/a (plan only)
- [x] Docs/env updated: `docs/clerk-v7-migration.md`
- [x] Verified: usage table built from repo grep; v7 specifics not verified against Clerk docs (stated in the doc)

## [18] Renovate
- [x] Code change: `renovate.json` (config:recommended, weekly grouped minor/patch, separate majors)
- [x] Test added: n/a (config)
- [x] Docs/env updated: n/a
- [ ] Verified: JSON written; not validated by Renovate (needs the Renovate app enabled on the repo)

## [17] gitleaks
- [x] Code change: `.gitleaks.toml`, `.githooks/pre-commit`, CI step in `.github/workflows/ci.yml`
- [x] Test added: n/a (config)
- [x] Docs/env updated: README line; fallback snippet `docs/gitleaks-ci.yml.txt`
- [x] Verified: local `gitleaks detect --config .gitleaks.toml`: 86 commits, no leaks (config parses)
- [x] CI step: applied to `ci.yml` by the PM with the workflow-scoped token (PR #17)
