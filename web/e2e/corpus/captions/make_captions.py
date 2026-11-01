#!/usr/bin/env python3
"""Writes audio/<voice>.wav (16 kHz mono, files only, never played) and timeline.json with each turn's
speech start and end in ms. macOS only (`say`, `afconvert`). Run from anywhere."""
import json, os, subprocess, tempfile, wave
HERE = os.path.dirname(os.path.abspath(__file__))
RATE = 16000
AUDIO = os.path.join(HERE, "..", "audio", "captions")  # gitignored
cfg = json.load(open(os.path.join(HERE, "captions.json")))
os.makedirs(AUDIO, exist_ok=True)

def speak(voice, text, tmp):
    aiff, wav = os.path.join(tmp, "t.aiff"), os.path.join(tmp, "t.wav")
    subprocess.run(["say", "-v", voice, "-o", aiff, text], check=True)  # -o writes a file, no playback
    subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", aiff, wav], check=True)
    with wave.open(wav) as w:
        return w.readframes(w.getnframes())

def trim(pcm):
    """Drop the silence `say` pads around speech so timeline starts are real speech onsets."""
    s = [int.from_bytes(pcm[i:i + 2], "little", signed=True) for i in range(0, len(pcm), 2)]
    loud = [i for i, v in enumerate(s) if abs(v) > 400]
    return pcm[2 * loud[0] : 2 * (loud[-1] + 1)]

timeline = {}
with tempfile.TemporaryDirectory() as tmp:
    for voice in cfg["voices"]:
        out, turns = bytearray(b"\0\0" * int(RATE * cfg["lead_silence_s"])), []
        for text in cfg["turns"]:
            pcm = trim(speak(voice, text, tmp))
            start = len(out) // 2 * 1000 // RATE
            out += pcm
            turns.append({"text": text, "start_ms": start, "end_ms": len(out) // 2 * 1000 // RATE})
            out += b"\0\0" * int(RATE * cfg["gap_s"])
        with wave.open(os.path.join(AUDIO, f"{voice.lower()}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(bytes(out))
        timeline[voice.lower()] = {"duration_ms": len(out) // 2 * 1000 // RATE, "turns": turns}
# One call for e2e/live-caption.spec.ts: room for the greeting, then turns spaced so the agent can answer.
with wave.open(os.path.join(AUDIO, "samantha.wav")) as w:
    pcm = w.readframes(w.getnframes())
call = bytearray(b"\0\0" * (RATE * 12))
for t in timeline["samantha"]["turns"][:4]:
    call += pcm[t["start_ms"] * 32 : t["end_ms"] * 32] + b"\0\0" * (RATE * 13)
with wave.open(os.path.join(AUDIO, "live-call.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(bytes(call))
json.dump(timeline, open(os.path.join(AUDIO, "timeline.json"), "w"), indent=1)
print({k: v["duration_ms"] for k, v in timeline.items()})
