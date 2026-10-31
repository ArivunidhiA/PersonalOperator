# Speed / CI checklist

Tick only when done and verified. Each item ships as its own PR.

## Item 28 - Health endpoint + uptime
- [x] Code: `web/app/api/health/route.ts` (Supabase reachable, Redis, GEMINI_API_KEY set; never mints a token; 200/503 JSON) and `.github/workflows/uptime.yml` (30-min schedule, fails loudly)
- [x] Test: vitest route test (ok and degraded paths)
- [x] Docs/env: `docs/ops/uptime.md` (Actions-minutes caveat, UptimeRobot alternative)
- [x] Verified: lint + typecheck + tests; route hit on local server

## Item 30 - Lightpanda smoke
- [x] Code: `web/scripts/smoke-lightpanda.mjs` (CDP via puppeteer-core; LINKS 2xx/3xx, /call/deadbeef renders, security headers, old endpoints 404) and `.github/workflows/smoke.yml` (hourly; fetch fallback)
- [x] Test: script run against a local `next start`
- [x] Docs/env: fallback behavior documented
- [x] Verified: script exit code and output

## Item 31 - axe a11y spec
- [ ] Code: `web/e2e/a11y.spec.ts` (/, /privacy skip on 404, /call/[token]) + `@axe-core/playwright`
- [ ] Test: the spec itself
- [ ] Docs/env: note in spec header
- [ ] Verified: spec run locally against `next start`

## Item 32 - Lighthouse CI
- [x] Code: `web/lighthouserc.json` (JS <= 450KB, performance >= 90 mobile) + PR workflow
- [x] Test: assertions are the test
- [x] Docs/env: workflow comments
- [x] Verified: `lhci autorun` locally

## Item 33 - size-limit
- [ ] Code: size-limit config for `/` client JS + CI step
- [ ] Test: `npm run size`
- [ ] Docs/env: config comments
- [ ] Verified: size run passes after build

## Item 34 - knip
- [ ] Code: knip config, delete unused `public/*.svg` and other proven-dead files, CI step
- [ ] Test: knip itself
- [ ] Docs/env: config comments
- [ ] Verified: `npx knip` clean, build still passes

## Item 36 - Nightly live evals
- [ ] Code: `.github/workflows/evals-nightly.yml` (`npm run eval:live`, GEMINI_API_KEY secret, upload `evals/.results`)
- [ ] Test: n/a (workflow); YAML parsed
- [ ] Docs/env: secret named in PR
- [ ] Verified: YAML validated

## Item 37 - Config rename + @types/node
- [x] Code: vitest configs renamed to `.mts`, references fixed, `@types/node` 24
- [x] Test: existing suite
- [x] Docs/env: n/a
- [x] Verified: lint + typecheck + tests
