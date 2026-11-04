// Runs Chrome's Web Speech API on a corpus file at real time, headless and muted.
// The WAV goes through AudioBufferSource -> MediaStreamDestination -> SpeechRecognition.start(track),
// never to ctx.destination, so nothing reaches the speakers.
// usage: node webspeech_bench.mjs <voice> <cloud|local|local-phrases> [--probe]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const voice = process.argv[2] ?? "samantha";
const mode = process.argv[3] ?? "cloud";
const dir = path.join(here, "../audio/captions");
const server = http.createServer((req, res) => {
  if (req.url.endsWith(".wav")) return res.end(fs.readFileSync(path.join(dir, path.basename(req.url))));
  res.setHeader("content-type", "text/html");
  res.end("<!doctype html><title>bench</title>");
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({
  channel: "chrome", headless: true,
  args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
});
const ctx = await browser.newContext({ permissions: ["microphone"] });
const page = await ctx.newPage();
page.on("console", (m) => console.log("[page]", m.text().slice(0, 200)));
await page.goto(`http://localhost:${port}/`);
const out = await page.evaluate(async ({ voice, mode }) => {
  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const info = { hasSR: !!SR, available: typeof SR?.available, install: typeof SR?.install, phrases: typeof window.SpeechRecognitionPhrase };
  if (!SR) return { info, events: [] };
  const local = mode !== "cloud";
  if (SR.available) {
    info.avail = await SR.available({ langs: ["en-US"], processLocally: local }).catch((e) => "err:" + e.message);
    if (local && info.avail !== "available" && SR.install) {
      const t = performance.now();
      info.install = await SR.install({ langs: ["en-US"], processLocally: true }).catch((e) => "err:" + e.message);
      info.installMs = performance.now() - t;
      info.avail2 = await SR.available({ langs: ["en-US"], processLocally: true }).catch((e) => "err:" + e.message);
    }
  }
  const actx = new AudioContext();
  await actx.resume();
  const buf = await actx.decodeAudioData(await (await fetch(`/${voice}.wav`)).arrayBuffer());
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  const rec = new SR();
  rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  if (local) rec.processLocally = true;
  if (mode === "local-phrases") rec.phrases = ["Ariv", "INZI", "INZI Controls", "forecost", "Registrum", "Malbit", "Agno", "pgvector", "NeMo Curator"].map((p) => new SpeechRecognitionPhrase(p, 5));
  const events = [], errors = [];
  let t0 = 0;
  rec.onresult = (e) => {
    let finalText = "", partial = "";
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript; else partial += r[0].transcript;
    }
    events.push({ t: performance.now() - t0, finalText, partial, conf: e.results[e.results.length - 1]?.[0]?.confidence });
  };
  rec.onerror = (e) => errors.push({ t: performance.now() - t0, error: e.error, msg: e.message });
  const ended = new Promise((r) => { rec.onend = () => r(performance.now() - t0); });
  rec.onstart = () => { info.startMs = performance.now() - t0; };
  try { rec.start(dest.stream.getAudioTracks()[0]); } catch (e) { return { info, events, errors: ["start:" + e.message] }; }
  t0 = performance.now();
  src.start();
  const stop = new Promise((r) => { src.onended = () => setTimeout(r, 3000); });
  await Promise.race([stop, ended]);
  rec.stop();
  await Promise.race([ended, new Promise((r) => setTimeout(r, 3000))]);
  return { info, events, errors };
}, { voice, mode });
await browser.close();
server.close();
const o = path.join(here, "../out/captions");
fs.mkdirSync(o, { recursive: true });
fs.writeFileSync(path.join(o, `webspeech-${mode}-${voice}.json`), JSON.stringify({ engine: `webspeech-${mode}`, voice, mode: "snapshot", ...out }));
console.log(JSON.stringify(out.info), "events", out.events.length, JSON.stringify(out.errors));
console.log(out.events.slice(-1)[0]?.finalText);
