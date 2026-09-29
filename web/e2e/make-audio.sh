#!/usr/bin/env bash
# Builds e2e/fixtures/caller.wav: a scripted caller for Chrome's fake microphone.
# macOS only (uses `say` + `afconvert`). 6 s silence, question 1, 14 s, question 2, 16 s, question 3, 40 s.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fixtures
say -v Samantha -o fixtures/q1.aiff "Where does Ariv work right now?"
say -v Samantha -o fixtures/q2.aiff "Cool. Can you drop his LinkedIn and GitHub in the chat?"
say -v Samantha -o fixtures/q3.aiff "Nice. Can you also drop his booking link in the chat?"
for f in q1 q2 q3; do afconvert -f WAVE -d LEI16@48000 -c 1 "fixtures/$f.aiff" "fixtures/$f.wav" && rm "fixtures/$f.aiff"; done
python3 - <<'EOF'
import wave
def read(p):
    w = wave.open(p); d = w.readframes(w.getnframes()); w.close(); return d
sil = lambda s: b"\x00\x00" * int(48000 * s)
out = sil(6) + read("fixtures/q1.wav") + sil(14) + read("fixtures/q2.wav") + sil(16) + read("fixtures/q3.wav") + sil(40)
w = wave.open("fixtures/caller.wav", "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(out); w.close()
EOF
rm -f fixtures/q1.wav fixtures/q2.wav fixtures/q3.wav
echo "wrote e2e/fixtures/caller.wav"
