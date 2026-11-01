# Live caption measurements (2026-10-31, build base d3bf74a)

Chrome 156 headless, muted, macOS. Gemini `gemini-3.8-live` with production VAD settings. Corpus: 6 macOS voices x 7 turns (42 turns) with every hard name. **Synthetic voices only; no real human speech, no real room echo.** On-device engines ran natively, with times simulated from audio position, so they flatter those engines against a browser run.

| Engine | First word p50 / p95 ms | Word lag p50 ms | Cadence ms | Updates | WER | Names | Revised/word | Download |
|---|---|---|---|---|---|---|---|---|
| Gemini today | 3903 / 6333 | 2700 | 6088 | 7 | 0.100 | 0.53 | 0.00 | none |
| Web Speech raw | 591 / 708 | 180 | 127 | 160 | 0.154 | 0.15 | 0.46 | none |
| Module, all text | 579 / 692 | 193 | 125 | 161 | 0.066* | 0.73* | 0.40 | 10 KB source |
| Module, settled text | 820 / 957 | 369 | 125 | 161 | 0.066* | 0.73* | 0.14 | 10 KB source |
| Moonshine small | 514 / 806 | 230 | 600 | 42 | 0.126 | 0.33 | 0.64 | 142 MB |
| Moonshine tiny | 693 / 900 | 292 | 600 | 42 | 0.167 | 0.28 | 0.62 | 45 MB |
| Zipformer | 711 / 900 | 375 | 300 | 70 | 0.224 | 0.20 | 0.23 | ~71 MB |
| Zipformer + hotwords | 686 / 847 | 333 | 300 | 72 | 0.229 | 0.38 | 0.29 | ~71 MB |

*Includes `live-caption-names.ts`, written from three of these voices. Held-out voices: names 0.13 to 0.67; tuned voices: 0.17 to 0.83.

- Gemini sent one event per turn, 1252 ms p50 after speech ended (max 3002), and never set `finished`.
- First word under 300 ms from speech onset: **missed by every engine**. The first word takes 254 ms p50 to say.
- Saved transcript through the real reducer, 6 voices: WER 0.100 (Gemini only) to 0.085, 7 of 7 lines on each. The 0.8 lost-turn threshold was chosen on this corpus.
- Echo, real module and Web Speech, agent voice with no canceller: 0 captions in 7 turns (1 voice). Barge-in: agent turn dropped, caller turn kept (1 voice).
- Prediction: best-case perfect prefix, `gemini-flash-lite-latest`: 4 of 14 next words right, 669 ms p50. Slower than hearing the word.
- Display rules on the raw log: agree2 361 ms lag / 0.18 revised; agree3 533 / 0.12; tail1 459 / 0.15.

Not measured: Web Speech on-device (`processLocally`) gave 0 results headless, with the pack installed and no error. Whisper: not run, it isn't a streaming model. Moonshine and Zipformer inside a browser. Deepgram ($0.0077/min, keyterms $0.0013/min) and AssemblyAI ($0.15/hour, keyterms $0.04/hour): list prices only, no signup. A second Gemini stream: not run separately, it would use the same one-event-per-turn transcription as the Gemini row. Android, iOS, Firefox: gated off, not run.

Reproduce from `web/` (nothing is played; the live runs use the shared free key, so run a voice at a time):

    python3 e2e/corpus/captions/make_captions.py
    node e2e/corpus/captions/gemini_stream.mjs samantha
    node e2e/corpus/captions/webspeech_bench.mjs samantha cloud
    node --no-warnings e2e/corpus/captions/module_bench.mjs samantha plain   # also echo, bargein
    python3 e2e/corpus/captions/caption_metrics.py
    python3 e2e/corpus/captions/stabilize_eval.py
    node --no-warnings e2e/corpus/captions/names_eval.mjs
    node --no-warnings e2e/corpus/captions/saved_eval.mjs samantha,daniel,karen,rishi,moira,aman
    node e2e/corpus/captions/predict_eval.mjs gemini-flash-lite-latest

Run Chrome benches one at a time: three at once stalled.
