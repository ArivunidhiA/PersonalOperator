// Drives the real lib/voice/live-caption.ts in headless, muted Chrome with real Web Speech.
// usage: node module_bench.mjs <voice> <plain|echo|bargein>
// plain: every turn is the caller. echo: every turn is the agent's voice in the mic, with no echo canceller.
// bargein: turn 2 is the agent, turn 3 is the caller cutting in.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const voice = process.argv[2] ?? "samantha";
const scene = process.argv[3] ?? "plain";
const dir = path.join(here, "../audio/captions");
const lib = path.join(here, "../../../lib/voice");
const js = (f) => stripTypeScriptTypes(fs.readFileSync(path.join(lib, f), "utf8"));
const names = js("live-caption-names.ts");
const mod = js("live-caption.ts").replace(/import \{ fixNames \} from "\.\/live-caption-names";/, 'import { fixNames } from "/names.js";');
const server = http.createServer((req, res) => {
  if (req.url.endsWith(".wav")) return res.end(fs.readFileSync(path.join(dir, path.basename(req.url))));
  if (req.url === "/names.js") { res.setHeader("content-type", "text/javascript"); return res.end(names); }
  if (req.url === "/mod.js") { res.setHeader("content-type", "text/javascript"); return res.end(mod); }
  res.setHeader("content-type", "text/html");
  res.end("<!doctype html><title>bench</title>");
}).listen(0);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36" })).newPage();
await page.goto(`http://localhost:${server.address().port}/`);
const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json")))[voice];
const out = await page.evaluate(async ({ voice, scene, turns }) => {
  const { startLiveCaption, liveCaptionSupported } = await import("/mod.js");
  const actx = new AudioContext();
  await actx.resume();
  const buf = await actx.decodeAudioData(await (await fetch(`/${voice}.wav`)).arrayBuffer());
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  const events = [];
  let t0 = 0, unavailable = null, cancels = 0;
  const lc = startLiveCaption(dest.stream.getAudioTracks()[0], {
    onCaption: (c) => events.push({ t: performance.now() - t0, ...c }),
    onCancel: () => cancels++,
    onUnavailable: (r) => { unavailable = r; },
  });
  if (!lc) return { supported: liveCaptionSupported(), events };
  await new Promise((r) => setTimeout(r, 300));
  t0 = performance.now();
  src.start();
  const at = (ms, fn) => setTimeout(fn, ms);
  if (scene === "echo") {
    turns.forEach((t) => {
      at(t.start_ms - 50, () => { lc.addAgentText(t.text); lc.setAgentSpeaking(true); });
      at(t.end_ms + 100, () => lc.setAgentSpeaking(false));
    });
  }
  if (scene === "bargein") {
    const [, a, b] = turns;
    at(a.start_ms - 50, () => { lc.addAgentText(a.text); lc.setAgentSpeaking(true); });
    at(b.start_ms + 300, () => lc.bargeIn());
    at(b.start_ms + 50, () => lc.setAgentSpeaking(true)); // the agent is still playing when the caller starts
  }
  await new Promise((r) => { src.onended = () => setTimeout(r, 2500); });
  lc.stop();
  return { supported: true, events, unavailable, cancels };
}, { voice, scene, turns: timeline.turns });
await browser.close();
server.close();
const o = path.join(here, "../out/captions/module");
fs.mkdirSync(o, { recursive: true });
fs.writeFileSync(path.join(o, `${scene}-${voice}.json`), JSON.stringify({ voice, scene, ...out }));
console.log(scene, voice, "supported", out.supported, "captions", out.events.length, "cancels", out.cancels, "unavailable", out.unavailable);
const seen = {};
for (const e of out.events) seen[e.utterance] = e;
console.log(Object.values(seen).map((e) => `[${Math.round(e.t)}] ${e.text}`).join("\n"));
