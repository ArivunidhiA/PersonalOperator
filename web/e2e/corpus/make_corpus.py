#!/usr/bin/env python3
"""Generate the synthetic caller WAVs listed in callers.json into audio/ (files only, never played).

macOS only (`say` + `afconvert`). Speed +-15% and background noise use sox when installed;
otherwise a stdlib fallback (naive resample, so pitch shifts with speed; white-noise mix).
Layout per caller matches ../make-audio.sh: silence, q1, silence, q2, silence, q3, silence.
"""
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
RATE = 48000
cfg = json.load(open(os.path.join(HERE, "callers.json")))
HAVE_SOX = shutil.which("sox") is not None


def read(p):
    with wave.open(p) as w:
        return w.readframes(w.getnframes())


def write(p, data):
    with wave.open(p, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data)


def silence(s):
    return b"\x00\x00" * int(RATE * s)


def speed_fallback(data, factor):
    n = len(data) // 2
    out = bytearray()
    for i in range(int(n / factor)):
        j = min(int(i * factor), n - 1)
        out += data[2 * j : 2 * j + 2]
    return bytes(out)


def noise_fallback(data, amp=0.02):
    rng = random.Random(7)
    out = bytearray()
    for i in range(0, len(data), 2):
        s = int.from_bytes(data[i : i + 2], "little", signed=True)
        s = max(-32768, min(32767, s + int(rng.uniform(-1, 1) * amp * 32767)))
        out += s.to_bytes(2, "little", signed=True)
    return bytes(out)


def speak(voice, text, tmp, name):
    aiff, wav = os.path.join(tmp, name + ".aiff"), os.path.join(tmp, name + ".wav")
    subprocess.run(["say", "-v", voice, "-o", aiff, text], check=True)  # -o writes a file, no playback
    subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", aiff, wav], check=True)
    return wav


def retime(wav, factor, tmp):
    if factor == 1.0:
        return read(wav)
    if HAVE_SOX:
        out = wav + ".t.wav"
        subprocess.run(["sox", wav, out, "tempo", str(factor)], check=True)
        return read(out)
    return speed_fallback(read(wav), factor)


def add_noise(path, tmp):
    if HAVE_SOX:
        dur = subprocess.check_output(["soxi", "-D", path]).decode().strip()
        noise = os.path.join(tmp, "noise.wav")
        subprocess.run(["sox", "-n", "-r", str(RATE), "-c", "1", noise, "synth", dur, "whitenoise", "vol", "0.02"], check=True)
        out = path + ".n.wav"
        subprocess.run(["sox", "-m", path, noise, out], check=True)
        return out
    write(path, noise_fallback(read(path)))
    return path


os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
sil = cfg["silences_s"]
for c in cfg["callers"]:
    with tempfile.TemporaryDirectory() as tmp:
        clips = [retime(speak(c["voice"], q, tmp, f"q{i}"), c["speed"], tmp) for i, q in enumerate(cfg["script"])]
        out = silence(sil[0])
        for i, clip in enumerate(clips):
            out += clip + silence(sil[i + 1])
        dest = os.path.join(HERE, "audio", c["id"] + ".wav")
        write(dest, out)
        if c["noise"]:
            noisy = add_noise(dest, tmp)
            if noisy != dest:
                shutil.move(noisy, dest)
    print("wrote audio/" + c["id"] + ".wav", "(sox)" if HAVE_SOX else "(stdlib fallback)")
sys.exit(0)
