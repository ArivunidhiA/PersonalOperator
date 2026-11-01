// Replays logged captions and Gemini text through the real reducer, with the agent replying after each
// Gemini line, and scores the saved transcript. usage: node --no-warnings e2e/corpus/captions/saved_eval.mjs
import fs from "node:fs";
import { initialTranscript, toMessages, transcriptReducer } from "../../../lib/voice/transcript.ts";
const norm = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
const wer = (a, b) => {
  const d = b.map((_, i) => i + 1); d.unshift(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const c = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] !== b[j - 1] ? 1 : 0)); prev = c; }
  }
  return d[b.length] / a.length;
};
const tl = JSON.parse(fs.readFileSync("e2e/corpus/audio/captions/timeline.json"));
const voices = process.argv[2]?.split(",") ?? ["samantha"];
let geminiOnly = 0, merged = 0, wrongLines = 0;
const utter = (r) => r.events.map((e) => ({ t: e.t, a: { type: "userPartial", utterance: e.utterance, text: e.text, settled: e.settled } }));
for (const v of voices) {
  const ref = norm(tl[v].turns.map((t) => t.text).join(" "));
  const g = JSON.parse(fs.readFileSync(`e2e/corpus/out/captions/gemini-${v}.json`)).events.filter((e) => e.text);
  const gemEv = g.flatMap((e) => [{ t: e.t, a: { type: "userDelta", text: e.text } }, { t: e.t + 50, a: { type: "agentDelta", text: "Sure." } }, { t: e.t + 1500, a: { type: "agentFinal" } }]);
  const cap = utter(JSON.parse(fs.readFileSync(`e2e/corpus/out/captions/module/plain-${v}.json`)));
  const run = (ev) => ev.sort((x, y) => x.t - y.t).reduce((s, e) => transcriptReducer(s, e.a), initialTranscript);
  const text = (s) => toMessages(s.items).filter((m) => m.role === "user").map((m) => m.text);
  const a = text(run([...gemEv])), b = text(run([...gemEv, ...cap]));
  geminiOnly += wer(ref, norm(a.join(" "))); merged += wer(ref, norm(b.join(" ")));
  wrongLines += b.length !== tl[v].turns.length ? 1 : 0;
  console.log(v, "gemini lines", a.length, "merged lines", b.length);
  if (v === voices[0]) console.log(b.join("\n"));
}
console.log("saved WER gemini only", (geminiOnly / voices.length).toFixed(3), "merged", (merged / voices.length).toFixed(3), "runs with wrong line count", wrongLines);
