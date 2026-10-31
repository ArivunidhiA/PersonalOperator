#!/usr/bin/env python3
"""Word error rate of what the agent heard vs the normalized reference text.

Input: out/results.jsonl (written by voice-call.spec.ts when E2E_CORPUS=1), rows {id, ref, heard}.
`heard` is the page's own caller transcript (Gemini Live), normalized here with the same rules as the
reference. Pure stdlib; for a stand-alone NeMo ASR WER (optional) see README.md.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def norm(t):
    t = t.lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z' ]", " ", t)).strip()


def wer(ref, hyp):
    r, h = ref.split(), hyp.split()
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(1, len(r))


path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out", "results.jsonl")
rows = [json.loads(l) for l in open(path) if l.strip()]
for r in rows:
    print(f"{r['id']:<22} WER {wer(norm(r['ref']), norm(r['heard'])):.2f}")
if rows:
    print(f"{'mean':<22} WER {sum(wer(norm(r['ref']), norm(r['heard'])) for r in rows) / len(rows):.2f}")
