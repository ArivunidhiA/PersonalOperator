# Speed / voice checklist (po-voice)

Tick only when done AND verified. Gate per PR: `cd web && npm run lint && npm run typecheck && npm test`
(GitHub Actions minutes exhausted; CI blocked, local verification is the gate).

## 25 Concurrent prepareAudio + session fetch (`web/lib/voice/start.ts`)
- [x] Code: both run concurrently; mic requested inside the tap; mic released on any failure; abort semantics kept
- [x] Test added: `web/__tests__/voice-start.test.ts`
- [x] Docs/env updated: n/a (no env change)
- [x] Verified: unit tests (concurrency, release on fetch fail / mic fail / abort); full gate

## 26 Prefetch worklets at module init (`web/lib/voice/start.ts`)
- [ ] Code: fetch /audio/pcm-capture.js + pcm-player.js at module load (browser only), layout.tsx untouched
- [ ] Test added: `web/__tests__/voice-start.test.ts`
- [ ] Docs/env updated: n/a
- [ ] Verified: unit test (prefetch fired once, SSR-safe); full gate

## 27 Client VAD gating (`gemini.ts`, `pcm-capture.js`)
- [ ] Code: gated by NEXT_PUBLIC_CLIENT_VAD=1, 300 ms hangover, no onset latency
- [ ] Test added
- [ ] Docs/env updated: README env note, Gemini continuous-audio finding documented
- [ ] Verified: unit tests; real-browser check (state result honestly)

## 39 Superpowers pointer + stall watchdog (`gemini.ts`)
- [ ] Code: AGENTS.md pointer; false nudge fixed
- [ ] Test added: watchdog during late input transcription
- [ ] Docs/env updated: AGENTS.md
- [ ] Verified: test fails before fix, passes after; full gate

## 43 liveAt exposed (`gemini.ts`)
- [ ] Code: liveAt recorded at setupComplete and exposed on VoiceSession
- [ ] Test added
- [ ] Docs: RealtimeVoice one-liner + server expectation in side-session item43.md
- [ ] Verified: unit test; full gate
# Speed / voice checklist (po-voice)

Tick only when done AND verified. Gate per PR: `cd web && npm run lint && npm run typecheck && npm test`
(GitHub Actions minutes exhausted; CI blocked, local verification is the gate).

## 25 Concurrent prepareAudio + session fetch (`web/lib/voice/start.ts`)
- [ ] Code: both run concurrently; mic requested inside the tap; mic released on any failure; abort semantics kept
- [ ] Test added: `web/__tests__/voice-prefetch.test.ts`
- [ ] Docs/env updated: n/a (no env change)
- [ ] Verified: unit tests (concurrency, release on fetch fail / mic fail / abort); full gate

## 26 Prefetch worklets at module init (`web/lib/voice/start.ts`)
- [x] Code: fetch /audio/pcm-capture.js + pcm-player.js at module load (browser only), layout.tsx untouched
- [x] Test added: `web/__tests__/voice-prefetch.test.ts`
- [x] Docs/env updated: n/a
- [x] Verified: unit test (prefetch fired once, SSR-safe); full gate

## 27 Client VAD gating (`gemini.ts`, `pcm-capture.js`)
- [ ] Code: gated by NEXT_PUBLIC_CLIENT_VAD=1, 300 ms hangover, no onset latency
- [ ] Test added
- [ ] Docs/env updated: README env note, Gemini continuous-audio finding documented
- [ ] Verified: unit tests; real-browser check (state result honestly)

## 39 Superpowers pointer + stall watchdog (`gemini.ts`)
- [ ] Code: AGENTS.md pointer; false nudge fixed
- [ ] Test added: watchdog during late input transcription
- [ ] Docs/env updated: AGENTS.md
- [ ] Verified: test fails before fix, passes after; full gate

## 43 liveAt exposed (`gemini.ts`)
- [ ] Code: liveAt recorded at setupComplete and exposed on VoiceSession
- [ ] Test added
- [ ] Docs: RealtimeVoice one-liner + server expectation in side-session item43.md
- [ ] Verified: unit test; full gate
# Speed / voice checklist (po-voice)

Tick only when done AND verified. Gate per PR: `cd web && npm run lint && npm run typecheck && npm test`
(GitHub Actions minutes exhausted; CI blocked, local verification is the gate).

## 25 Concurrent prepareAudio + session fetch (`web/lib/voice/start.ts`)
- [ ] Code: both run concurrently; mic requested inside the tap; mic released on any failure; abort semantics kept
- [ ] Test added: `web/__tests__/voice-start.test.ts`
- [ ] Docs/env updated: n/a (no env change)
- [ ] Verified: unit tests (concurrency, release on fetch fail / mic fail / abort); full gate

## 26 Prefetch worklets at module init (`web/lib/voice/start.ts`)
- [ ] Code: fetch /audio/pcm-capture.js + pcm-player.js at module load (browser only), layout.tsx untouched
- [ ] Test added: `web/__tests__/voice-start.test.ts`
- [ ] Docs/env updated: n/a
- [ ] Verified: unit test (prefetch fired once, SSR-safe); full gate

## 27 Client VAD gating (`gemini.ts`, `pcm-capture.js`)
- [ ] Code: gated by NEXT_PUBLIC_CLIENT_VAD=1, 300 ms hangover, no onset latency
- [ ] Test added
- [ ] Docs/env updated: README env note, Gemini continuous-audio finding documented
- [ ] Verified: unit tests; real-browser check (state result honestly)

## 39 Superpowers pointer + stall watchdog (`gemini.ts`)
- [ ] Code: AGENTS.md pointer; false nudge fixed
- [ ] Test added: watchdog during late input transcription
- [ ] Docs/env updated: AGENTS.md
- [ ] Verified: test fails before fix, passes after; full gate

## 43 liveAt exposed (`gemini.ts`)
- [x] Code: liveAt recorded at setupComplete and exposed on VoiceSession
- [x] Test added
- [x] Docs: RealtimeVoice one-liner + server expectation in side-session item43.md
- [x] Verified: unit test; full gate
