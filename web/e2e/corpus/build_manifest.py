#!/usr/bin/env python3
"""Build manifest.jsonl for the voice-call corpus (one row per synthetic caller in callers.json).

Reference text is normalized with SDP's CreateInitialManifestByExt -> SubRegex -> DropNonAlphabet
when SDP is installed (SDP_DIR=<checkout of NVIDIA/NeMo-speech-data-processor>, Python 3.10 + NeMo),
otherwise by a pure-Python equivalent of the same regexes (NORMALIZE below). Both give the same text.

  python3 build_manifest.py            # SDP if available, else fallback
  python3 build_manifest.py --no-sdp   # force fallback
"""
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "callers.json")))
RAW = " ".join(cfg["script"])
ALPHABET = set(" abcdefghijklmnopqrstuvwxyz'")
# Same rules as sdp-normalize.yaml (SubRegex), applied in order to the lowercased text.
NORMALIZE = [("&", " and "), ("[‘’ʼ′]", "'"), ("[^a-z' ]", " "), (r"\s+", " "), ("^ | $", "")]


def normalize_fallback(text):
    for pat, repl in NORMALIZE:
        text = re.sub(pat, repl, text)
    return text if set(text) <= ALPHABET else None  # DropNonAlphabet


def rows_base():
    return [
        {"id": c["id"], "audio_filepath": f"audio/{c['id']}.wav", "voice": c["voice"], "speed": c["speed"], "noise": c["noise"], "raw_text": RAW, "text": RAW.lower()}
        for c in cfg["callers"]
    ]


def run_sdp(rows):
    sdp_dir = os.environ.get("SDP_DIR")
    if not sdp_dir or not os.path.exists(os.path.join(sdp_dir, "main.py")):
        return None
    audio = os.path.join(HERE, "audio")
    if not os.path.isdir(audio):
        print("audio/ missing: run make_corpus.py first (SDP indexes the WAVs)", file=sys.stderr)
        return None
    with tempfile.TemporaryDirectory() as ws:
        py = sys.executable
        subprocess.run([py, os.path.join(sdp_dir, "main.py"), f"--config-path={HERE}", "--config-name=sdp-initial", f"workspace_dir={ws}", f"raw_data_dir={audio}"], check=True)
        by_path = {r["audio_filepath"]: r for r in rows}
        stage = os.path.join(ws, "manifest_in.json")
        with open(os.path.join(ws, "manifest0.json")) as f, open(stage, "w") as out:
            for line in f:
                p = os.path.relpath(json.loads(line)["audio_filepath"], HERE)
                if p in by_path:
                    out.write(json.dumps(by_path[p], ensure_ascii=False) + "\n")
        subprocess.run([py, os.path.join(sdp_dir, "main.py"), f"--config-path={HERE}", "--config-name=sdp-normalize", f"workspace_dir={ws}", f"input_manifest_file={stage}"], check=True)
        with open(os.path.join(ws, "manifest_normalized.json")) as f:
            return [json.loads(l) for l in f if l.strip()]


def main():
    rows = rows_base()
    done = None if "--no-sdp" in sys.argv else run_sdp(rows)
    if done is None:
        print("SDP not used (set SDP_DIR, Python 3.10 + NeMo, run make_corpus.py first); using the pure-Python equivalent")
        done = []
        for r in rows:
            t = normalize_fallback(r["text"])
            if t is not None:
                done.append({**r, "text": t})
    with open(os.path.join(HERE, "manifest.jsonl"), "w") as f:
        for r in done:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote manifest.jsonl ({len(done)} callers)")


main()
