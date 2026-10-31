# Speed / reliability / quality checklist

Tick a sub-step only when done and verified. An item is done when all are ticked. Gate: `npm run lint && npm run typecheck && npm test` in `web/` (GitHub Actions minutes often exhausted).

## 25 Concurrent prepareAudio + session fetch — po-speed-voice
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 26 Prefetch audio worklets — po-speed-voice
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 27 Client VAD gating — po-speed-voice
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 28 Health route + uptime workflow — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 29 Client error reporting — speed-reliability (parent)
- [x] Code change
- [x] Test added
- [x] Docs/env updated
- [ ] Verified how: unit test `lock-report.test.ts` (reportError dedupe); route + ErrorBoundary wiring handed to PM (po-security/po-design)
- [ ] PR: (url)

## 30 Lightpanda smoke — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 31 axe a11y spec — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 32 Lighthouse CI — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 33 size-limit — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 34 knip + dead assets — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 35 known-risks.md — speed-reliability (parent)
- [x] Code change
- [x] Test added
- [x] Docs/env updated
- [ ] Verified how: rows reference existing tests (rg-checked)
- [ ] PR: (url)

## 36 Nightly live evals — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 37 vitest .mts + @types/node 24 — po-speed-ci
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 39 Superpowers + watchdog test/fix — po-speed-voice
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 40 NeMo SDP corpus — po-speed-corpus
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 41 normalize-numbers in verifier — po-speed-corpus
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 42 withLock helper — speed-reliability (parent)
- [x] Code change
- [x] Test added
- [x] Docs/env updated
- [ ] Verified how: unit test: in-memory lock excludes 2nd holder; route patch handed to PM
- [ ] PR: (url)

## 43 liveAt from setupComplete — po-speed-voice
- [ ] Code change
- [ ] Test added
- [ ] Docs/env updated
- [ ] Verified how: (fill in)
- [ ] PR: (url)

## 44 Strix checklist line — speed-reliability (parent)
- [x] Code change
- [x] Test added
- [x] Docs/env updated
- [ ] Verified how: checklist line in known-risks.md; strix.md is po-security's
- [ ] PR: (url)

