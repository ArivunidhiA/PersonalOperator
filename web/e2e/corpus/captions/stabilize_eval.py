#!/usr/bin/env python3
"""Replays the logged Web Speech partials through display rules, offline, to compare lag and revisions."""
import json, glob, os, sys, statistics as st
sys.argv = ["x"]
import importlib.util
spec = importlib.util.spec_from_file_location("cm", os.path.join(os.path.dirname(os.path.abspath(__file__)), "caption_metrics.py"))
cm = importlib.util.module_from_spec(spec); spec.loader.exec_module(cm)

def lcp(a, b):
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return a[:n]

def hold(run, k):
    """Show only words the last k snapshots agree on, but always release at a final."""
    hist, ev = [], []
    for e in run["events"]:
        w = (e["finalText"] + " " + e["partial"]).split()
        hist = (hist + [w])[-k:]
        s = hist[0]
        for h in hist[1:]:
            s = lcp(s, h)
        fin = e["finalText"].split()
        if len(s) < len(fin):
            s = fin
        ev.append({"t": e["t"], "finalText": " ".join(s), "partial": ""})
    return {**run, "events": ev}

def tail(run, n):
    """Hold back the last n words of the partial."""
    ev = []
    for e in run["events"]:
        p = e["partial"].split()
        ev.append({"t": e["t"], "finalText": e["finalText"], "partial": " ".join(p[:-n] if n else p)})
    return {**run, "events": ev}

runs = [json.load(open(p)) for p in sorted(glob.glob(os.path.join(cm.OUT, "webspeech-cloud-*.json")))]
print(f"{'rule':<14}{'ttfw':>7}{'lag':>7}{'revised':>9}{'updates':>9}")
for name, fn in [("raw", lambda r: r), ("agree2", lambda r: hold(r, 2)), ("agree3", lambda r: hold(r, 3)), ("agree4", lambda r: hold(r, 4)), ("tail1", lambda r: tail(r, 1)), ("tail2", lambda r: tail(r, 2)), ("tail1+agree3", lambda r: hold(tail(r, 1), 3))]:
    s = [cm.score(fn(r)) for r in runs]
    print(f"{name:<14}{st.median(x for r in s for x in r['ttfw']):>7.0f}{st.median(x for r in s for x in r['lag']):>7.0f}{st.mean(r['revised'] for r in s):>9.2f}{st.mean(r['updates'] for r in s):>9.0f}")
