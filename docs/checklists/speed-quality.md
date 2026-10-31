# Speed / reliability / quality checklist

Reconciled against `speed-voice.md`, `speed-ci.md`, `speed-corpus.md` and the merged PRs. Gate: local `npm run lint && npm run typecheck && npm test` in `web/` (Actions minutes exhausted, no CI evidence on any PR).

## 25 Concurrent prepareAudio + session fetch
- [x] Code, test and docs: merged in #12
- [x] Verified: local lint, typecheck, tests

## 26 Prefetch audio worklets
- [x] Code, test and docs: merged in #16
- [x] Verified: local lint, typecheck, tests

## 27 Client VAD gating
- [x] Code, test and docs: merged in #24
- Not verified: real-browser A/B of NEXT_PUBLIC_CLIENT_VAD=1 not done (flag default off; energy detector, not Silero), needs Ari

## 28 Health route + uptime workflow
- [x] Code, test and docs: merged in #18
- [x] Verified: local lint, typecheck, tests

## 29 Client error reporting
- [x] Code, test and docs: merged in #6
- [x] Verified: local lint, typecheck, tests
- Not verified: /api/client-error route and ErrorBoundary wiring belong to po-security/po-design; run migrate-v5.sql in Supabase, needs Ari

## 30 Lightpanda smoke
- [x] Code, test and docs: merged in #23
- Not verified: Lightpanda CDP path never exercised (only plain-fetch fallback ran); first hourly workflow run, needs Ari

## 31 axe a11y spec
- [x] Code, test and docs: merged in #29
- Not verified: spec never run (Chromium download stalled); first CI/local run may surface violations, needs Ari

## 32 Lighthouse CI
- [x] Code, test and docs: merged in #32
- [x] Verified: local lint, typecheck, tests

## 33 size-limit
- [x] Code, test and docs: merged in #31
- [x] Verified: local lint, typecheck, tests

## 34 knip + dead assets
- [x] Code, test and docs: merged in #30
- [x] Verified: local lint, typecheck, tests
- Not verified: components/ui/avatar.tsx, chat-bubble.tsx, message-loading.tsx and @radix-ui/react-avatar left for po-design

## 35 known-risks.md
- [x] Code, test and docs: merged in #6
- [x] Verified: local lint, typecheck, tests

## 36 Nightly live evals
- [x] Code, test and docs: merged in #33
- Not verified: workflow never executed; add repo secret GEMINI_API_KEY and run once, needs Ari

## 37 vitest .mts + @types/node 24
- [x] Code, test and docs: merged in #11
- [x] Verified: local lint, typecheck, tests

## 39 Superpowers + watchdog test/fix
- [x] Code, test and docs: merged in #21
- [x] Verified: local lint, typecheck, tests

## 40 NeMo SDP corpus
- [x] Code, test and docs: merged in #22
- Not verified: SDP path needs Python 3.10 + NeMo (absent); sox not installed; live corpus e2e needs web/.env.local, needs Ari

## 41 normalize-numbers in verifier
- [x] Code, test and docs: merged in #15
- [x] Verified: local lint, typecheck, tests

## 42 withLock helper
- [x] Code, test and docs: merged in #6
- [x] Verified: local lint, typecheck, tests
- Not verified: finish route adoption by po-security

## 43 liveAt from setupComplete
- [x] Code, test and docs: merged in #20
- [x] Verified: local lint, typecheck, tests
- Not verified: RealtimeVoice sending liveAt in finish body is po-design/po-security (see side-session item43.md)

## 44 Strix checklist line
- [x] Code, test and docs: merged in #6
- [x] Verified: local lint, typecheck, tests

