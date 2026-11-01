// Feeds a corpus file to Gemini Live at real time and logs every inputTranscription with its arrival time.
// Silent: no audio is played. Uses the shared free key, so run small subsets.
// usage: node gemini_stream.mjs <voice> [model]   writes ../out/captions/gemini-<voice>.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(here, "../../../.env.local"), "utf8");
const key = /^GEMINI_API_KEY=["']?([^"'\n]+)/m.exec(env)?.[1];
const voice = process.argv[2] ?? "samantha";
const model = process.argv[3] ?? "gemini-3.8-live";
const wav = fs.readFileSync(path.join(here, `../audio/captions/${voice}.wav`));
const pcm = wav.subarray(wav.indexOf("data") + 8);

const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`);
const events = [];
const other = {};
let t0 = 0;
const done = (code) => {
  const dir = path.join(here, "../out/captions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `gemini-${voice}.json`), JSON.stringify({ engine: "gemini", model, voice, mode: "append", events, other }, null, 0));
  console.log(voice, "events", events.length, "close", code, JSON.stringify(other));
  process.exit(0);
};
ws.on("open", () => {
  ws.send(JSON.stringify({ setup: {
    model: `models/${model}`,
    generationConfig: { responseModalities: ["AUDIO"] },
    systemInstruction: { parts: [{ text: "Reply with one short word." }] },
    inputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: "START_SENSITIVITY_LOW", endOfSpeechSensitivity: "END_SENSITIVITY_LOW", prefixPaddingMs: 300, silenceDurationMs: 800 } },
  } }));
});
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.setupComplete) {
    t0 = performance.now();
    let off = 0, n = 0;
    const CHUNK = 1024; // 512 samples, 32 ms, same as pcm-capture.js
    const tick = () => {
      if (off >= pcm.length) return setTimeout(() => ws.close(), 6000);
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: pcm.subarray(off, off + CHUNK).toString("base64"), mimeType: "audio/pcm;rate=16000" } } }));
      off += CHUNK; n++;
      setTimeout(tick, Math.max(0, t0 + n * 32 - performance.now()));
    };
    tick();
    return;
  }
  const sc = m.serverContent;
  const t = performance.now() - t0;
  if (sc?.inputTranscription) events.push({ t, text: sc.inputTranscription.text ?? "", finished: !!sc.inputTranscription.finished });
  if (sc?.modelTurn && !other.firstModel) other.firstModel = t;
  if (sc?.interrupted) (other.interrupted = (other.interrupted ?? 0) + 1);
  if (sc?.turnComplete) (other.turns = (other.turns ?? 0) + 1);
});
ws.on("close", (c, r) => { other.closeReason = r?.toString().slice(0, 200); done(c); });
ws.on("error", (e) => { other.error = e.message; });
