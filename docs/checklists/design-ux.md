# Design / UX checklist (items 2, 21-24, 38, 45-56)

Tick only when done and verified. Item done = all sub-steps ticked. Gate: local `npm run lint && npm run typecheck && npm test` (CI minutes often exhausted).
Note: child sessions could not be started from a session-initiated turn, so all items are done in this session as stacked PRs.

## 2. Remove jspdf; print stylesheet + window.print()
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

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
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 45. Minimal landing: orb + one pill (Ask me / End / Cancel)
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 46. Footer: How this works · Privacy
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 47. Update e2e/voice-call.spec.ts assertions
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 48. Remove Sign in / AuthHeader from public page
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 49. Impeccable detect/distill/audit + docs/design/impeccable-report.md
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 50. One accent, distinctive typeface, orb palette, no halo; docs/design/DESIGN.md
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 51. Contrast: no informational text below white/60
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 52. Countdown hidden until 60 s remain
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 53. Remove mode label from status line
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 54. Favicon animates only while live (2 s)
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 55. Open Graph + Twitter meta + opengraph-image
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

## 56. robots.ts, sitemap.ts, manifest.ts
- [ ] code change
- [ ] test added/updated
- [ ] screenshot taken (UI items)
- [ ] docs updated
- [ ] verified (how: )

