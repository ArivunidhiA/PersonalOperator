# Speed / corpus checklist

Tick only when done and verified. CI (GitHub Actions minutes) is exhausted; the gate is local: `cd web && npm run lint && npm run typecheck && npm test`.

## 40 - NeMo SDP corpus for the voice e2e
- [x] Code: `web/e2e/corpus/` (make-corpus.sh, build_manifest.py, sdp-config.yaml, wer.py, manifest.jsonl)
- [x] Code: `voice-call.spec.ts` loops the manifest when `E2E_CORPUS=1`
- [x] Test added: `web/__tests__/corpus-manifest.test.ts` (manifest shape + normalization)
- [x] Docs: `web/e2e/corpus/README.md` (SDP Python 3.10 + NeMo requirement, optional ASR-WER step, env vars)
- [x] Verified: `make-corpus.sh` produced the wavs (files only, no playback); `build_manifest.py` ran (fallback path; SDP path documented, Python 3.10 absent here); `tsc --noEmit` passes; live e2e skipped (no `web/.env.local`)

## 41 - Spelled numbers to digits in the verifier
- [x] Code: `web/lib/normalize-numbers.ts`, applied in `verifyUtterance`
- [x] Test added: `web/__tests__/normalize-numbers.test.ts` + verifier cases
- [x] Docs: header comment notes the SDP rule port
- [x] Verified: existing `verifier.test.ts` still passes; full gate green
# Speed / corpus checklist

Tick only when done and verified. CI (GitHub Actions minutes) is exhausted; the gate is local: `cd web && npm run lint && npm run typecheck && npm test`.

