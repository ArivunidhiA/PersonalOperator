#!/usr/bin/env python3
"""Scores caption runs in ../out/captions/*.json against ../audio/captions/timeline.json.

Metrics per engine, averaged over turns:
  ttfw_ms   speech onset of a turn to the first new text for it
  lag_ms    median delay between a word being spoken (interpolated by characters) and showing
  cadence   median ms between updates inside a turn
  revised   shown words later replaced, as a share of reference words
  wer       final text vs reference (same normalization as wer.py)
  names     hard names right in the final text, per occurrence
"""
import glob, json, os, re, statistics as st, sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out", "captions")
tl = json.load(open(os.path.join(HERE, "..", "audio", "captions", "timeline.json")))
cfg = json.load(open(os.path.join(HERE, "captions.json")))

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

def snapshots(run, settled=False):
    """Every event becomes (t, full normalized text so far). settled: only text two updates agreed on."""
    out, acc = [], ""
    for e in run["events"]:
        if run["mode"] == "append":
            acc += " " + e["text"]; full = acc
        elif run["mode"] == "full":
            full = e["full"]
        elif run["mode"] == "caption":
            # Module output: one utterance's text per event.
            shown = e["text"] if not settled else e["text"][: e["settled"]]
            full = acc + " " + shown
            if e["final"]:
                acc = full
        else:
            full = e["finalText"] + " " + e["partial"]
        out.append((e["t"], norm(full)))
    return out

def score(run):
    snaps = snapshots(run, run.get("settled", False))
    turns = tl[run["voice"]]["turns"]
    ttfw, lags, gaps, revised, shown_refs = [], [], [], 0, 0
    for i, turn in enumerate(turns):
        nxt = turns[i + 1]["start_ms"] if i + 1 < len(turns) else 1e12
        base = [s for s in snaps if s[0] < turn["start_ms"]]
        base_n = len(base[-1][1].split()) if base else 0
        cur = [s for s in snaps if turn["start_ms"] <= s[0] < nxt]
        ref = norm(turn["text"]).split()
        shown_refs += len(ref)
        if not cur:
            continue
        grew = [s for s in cur if len(s[1].split()) > base_n]
        if grew:
            ttfw.append(grew[0][0] - turn["start_ms"])
        # A word's spoken end, by share of characters through the turn.
        dur = turn["end_ms"] - turn["start_ms"]
        cum, spoken = 0, []
        for w in ref:
            cum += len(w) + 1
            spoken.append(turn["start_ms"] + dur * cum / (sum(len(x) + 1 for x in ref)))
        for k, end in enumerate(spoken):
            hit = next((s[0] for s in cur if len(s[1].split()) - base_n > k), None)
            if hit is not None:
                lags.append(hit - end)
        ts = [s[0] for s in cur]
        gaps += [b - a for a, b in zip(ts, ts[1:])]
        prev = None
        for _, text in cur:
            w = text.split()[base_n:]
            if prev is not None:
                same = 0
                while same < min(len(prev), len(w)) and prev[same] == w[same]:
                    same += 1
                revised += len(prev) - same if len(w) >= same else 0
            prev = w
    final = snaps[-1][1] if snaps else ""
    full_ref = norm(" ".join(t["text"] for t in turns))
    words = final.split()
    names = [(n, sum(1 for w in full_ref.split() if w == n)) for n in cfg["names"]]
    got = sum(min(c, words.count(n)) for n, c in names)
    return dict(ttfw=ttfw, lag=lags, gaps=gaps, revised=revised / max(1, shown_refs), wer=wer(full_ref, final), names=got / sum(c for _, c in names), missed=len(turns) - len(ttfw), updates=len(snaps))

runs = {}
for p in sorted(glob.glob(os.path.join(OUT, "*.json"))):
    if not os.path.isfile(p) or os.path.basename(p).startswith("summary"):
        continue
    run = json.load(open(p))
    if run.get("events"):
        runs.setdefault(run["engine"], []).append(score(run))
for p in sorted(glob.glob(os.path.join(OUT, "module", "plain-*.json"))):
    run = {**json.load(open(p)), "mode": "caption"}
    runs.setdefault("live-caption (all)", []).append(score(run))
    runs.setdefault("live-caption (settled)", []).append(score({**run, "settled": True}))
fmt = "{:<26}{:>4}{:>10}{:>10}{:>9}{:>9}{:>8}{:>7}{:>8}{:>8}"
print(fmt.format("engine", "n", "ttfw_p50", "ttfw_p95", "lag_p50", "cadence", "updates", "wer", "names", "revised"))
summary = {}
for e, rs in runs.items():
    t = sorted(x for r in rs for x in r["ttfw"])
    l = [x for r in rs for x in r["lag"]]
    g = [x for r in rs for x in r["gaps"]]
    row = dict(n=len(rs), ttfw_p50=st.median(t) if t else None, ttfw_p95=t[int(0.95 * (len(t) - 1))] if t else None, lag_p50=st.median(l) if l else None, cadence_p50=st.median(g) if g else None, updates=st.mean(r["updates"] for r in rs), wer=st.mean(r["wer"] for r in rs), names=st.mean(r["names"] for r in rs), revised=st.mean(r["revised"] for r in rs), missed_turns=sum(r["missed"] for r in rs))
    summary[e] = row
    print(fmt.format(e, row["n"], *[f"{row[k]:.0f}" if row[k] is not None else "-" for k in ("ttfw_p50", "ttfw_p95", "lag_p50", "cadence_p50", "updates")], f"{row['wer']:.3f}", f"{row['names']:.2f}", f"{row['revised']:.2f}"))
json.dump(summary, open(os.path.join(OUT, "summary.json"), "w"), indent=1)
