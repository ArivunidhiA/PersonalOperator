# Voice e2e corpus

Synthetic callers (macOS voices x speed 0.85/1.0/1.15 x optional noise) for `voice-call.spec.ts`.

```
cd web/e2e/corpus
python3 make_corpus.py        # writes audio/*.wav (files only, never played; needs say + afconvert; sox optional)
python3 build_manifest.py     # writes manifest.jsonl (committed)
cd ../.. && E2E_CORPUS=1 npm run test:e2e   # one live call per caller; needs web/.env.local; run headless so nothing is audible
python3 e2e/corpus/wer.py     # optional: WER of what the agent heard vs the normalized reference
```

- `audio/` and `out/` are gitignored. `callers.json` is the source of truth for the callers and the script.
- Without sox, speed uses a naive resample (pitch shifts) and noise is mixed in Python. Install sox for tempo-preserving speed.
- Reference normalization uses NeMo Speech Data Processor: `CreateInitialManifestByExt` (sdp-initial.yaml), then `SubRegex` + `DropNonAlphabet` (sdp-normalize.yaml). SDP needs Python 3.10 and NeMo; to use it, create a 3.10 venv, install SDP's requirements, and set `SDP_DIR` to your checkout of NVIDIA/NeMo-speech-data-processor. Without it `build_manifest.py` uses a pure-Python copy of the same regexes (same output). The SDP path was not exercised on the authoring machine (no Python 3.10).
- ASR-WER is optional. `wer.py` compares the reference with the caller transcript Gemini Live produced in the page. For a NeMo ASR baseline, run a NeMo model (e.g. `nvidia/parakeet-tdt-0.6b-v2`) over `audio/*.wav`, put the output in a results file as `{id, ref, heard}` rows, and pass it to `wer.py`.

## Caption bench

`captions/` measures live caption engines against a harder corpus with the hard names. See `captions/RESULTS.md`.
