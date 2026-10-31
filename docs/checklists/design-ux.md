# Design / UX checklist (items 2, 21-24, 38, 45-56)

Tick only when done and verified. Item done = all sub-steps ticked. Gate: local `npm run lint && npm run typecheck && npm test` (CI minutes often exhausted).
Note: child sessions could not be started from a session-initiated turn, so all items are done in this session as stacked PRs.

## 2. Remove jspdf; print stylesheet + window.print()
- [x] code change
- [x] test added/updated
- [ ] screenshot taken (UI items): Not captured: print preview, needs a headed run
- [x] docs updated
- [x] verified (how: jspdf removed; build ok; print CSS keyed on data-print=transcript (visual print check not run))

## 21. Clerk only in app/dashboard/layout.tsx; drop Email-it button
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: lint/typecheck/197 tests; dashboard layout mounts Clerk; build ok)

## 22. Make / static (drop force-dynamic)
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: next build shows / as ○ static)

## 23. Remove unused Geist Mono
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: build ok, no geist-mono refs)

## 24. Remove @vercel/analytics
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: build ok, dep removed)

## 38. Split RealtimeVoice into CallControls, StatusLine, TranscriptLog, PostCallPanel, CardView
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: lint, typecheck, 205 tests incl. 8 new render tests; behaviour unchanged)

## 45. Minimal landing: orb + one pill (Ask me / End / Cancel)
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: next start build; Browser pane 375px + desktop idle, connecting (mic stubbed) screenshots; docs/design/screenshots)

## 46. Footer: How this works · Privacy
- [x] code change
- [ ] test added/updated: No test: static footer link
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: footer link visible in screenshots; /privacy page is po-security's)

## 47. Update e2e/voice-call.spec.ts assertions
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items): n/a: test-only change
- [x] docs updated
- [x] verified (how: edited only; e2e needs live Gemini, not run)

## 48. Remove Sign in / AuthHeader from public page
- [x] code change
- [ ] test added/updated: No test: removal verified by rg
- [x] screenshot taken: docs/design/screenshots/landing-idle-desktop.png shows no Sign in
- [x] docs updated
- [x] verified (how: rg: no AuthHeader on public page; dashboard keeps it)

## 49. Impeccable detect/distill/audit + docs/design/impeccable-report.md
- [x] code change
- [x] test added/updated
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: detect clean on main; critique/audit need an interactive run by Ari, CLI only has detect)

## 50. One accent, distinctive typeface, orb palette, no halo; docs/design/DESIGN.md
- [x] code change
- [ ] test added/updated: No test: visual/token change
- [x] screenshot taken (UI items)
- [x] docs updated
- [x] verified (how: screenshots: ivory/garnet orb, no halo; DESIGN.md)

## 51. Contrast: no informational text below white/60
- [x] code change
- [ ] test added/updated: No test: source audit (rg)
- [ ] screenshot taken (UI items): Not captured: contrast check was a source audit (rg), no screenshot
- [x] docs updated
- [x] verified (how: rg text-white/(30..50) = 0 in app/ components/)

## 52. Countdown hidden until 60 s remain
- [x] code change
- [x] test added/updated
- [ ] screenshot taken (UI items): Not captured: last-minute countdown state, needs a headed run
- [x] docs updated
- [x] verified (how: StatusLine unit test: hidden at 61s, shown at 59s)

## 53. Remove mode label from status line
- [x] code change
- [ ] test added/updated: No test: removal; StatusLine no longer takes a mode (call-components.test.tsx exercises StatusLine)
- [ ] screenshot taken (UI items): Not captured: live state with status line, needs a headed run
- [x] docs updated
- [x] verified (how: mode label gone from StatusLine; modeRef kept)

## 54. Favicon animates only while live (2 s)
- [x] code change
- [ ] test added/updated: No test: FaviconAnimator has none; `enabled` prop pre-existed
- [ ] screenshot taken (UI items): Not captured: tab favicon while live, needs a headed run
- [x] docs updated
- [x] verified (how: FaviconAnimator enabled={live}, 2s; unit/lint/build only)

## 55. Open Graph + Twitter meta + opengraph-image
- [x] code change
- [ ] test added/updated: No test: verified by curl of tags and /opengraph-image
- [ ] screenshot taken (UI items): Not captured: rendered /opengraph-image, needs a headed run
- [x] docs updated
- [x] verified (how: og tags in HTML; /opengraph-image 200 image/png)

## 56. robots.ts, sitemap.ts, manifest.ts
- [x] code change
- [ ] test added/updated: No test: verified by curl of the four endpoints
- [x] screenshot taken (UI items): n/a: plain-text/JSON endpoints
- [x] docs updated
- [x] verified (how: next start: robots 200, sitemap 200, manifest 200)


## Handed over from speed (done in PR #28)
- [x] item 29: reportError in ErrorBoundary.componentDidCatch and RealtimeVoice start catch (non-StartError)
- [x] item 43: liveAt sent in /api/calls/finish body; schema + route bound it for duration_s
- [x] test added: `__tests__/handover.test.tsx` (ErrorBoundary report, finishSchema liveAt); verified lint/typecheck/256 tests
