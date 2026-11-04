// Held-out check of live-caption-names.ts: fixes were written from samantha, daniel, karen only.
// usage: node --no-warnings e2e/corpus/captions/names_eval.mjs
import fs from "node:fs";
import { fixNames } from "../../../lib/voice/live-caption-names.ts";
const names = ["ariv", "inzi", "forecost", "registrum", "malbit", "agno", "pgvector", "nemo", "curator"];
const cfg = JSON.parse(fs.readFileSync("e2e/corpus/captions/captions.json", "utf8"));
const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
const ref = norm(cfg.turns.join(" "));
const total = names.reduce((n, x) => n + ref.filter((w) => w === x).length, 0);
const score = (t) => names.reduce((n, x) => n + Math.min(ref.filter((w) => w === x).length, norm(t).filter((w) => w === x).length), 0) / total;
for (const [set, voices] of [["tuned", ["samantha", "daniel", "karen"]], ["held-out", ["rishi", "moira", "aman"]]]) {
  let a = 0, b = 0;
  for (const v of voices) {
    const j = JSON.parse(fs.readFileSync(`e2e/corpus/out/captions/webspeech-cloud-${v}.json`, "utf8"));
    const last = j.events.at(-1);
    const t = last.finalText + " " + last.partial;
    a += score(t); b += score(fixNames(t));
  }
  console.log(set, "names before", (a / 3).toFixed(2), "after", (b / 3).toFixed(2));
}
const safe = ["my friend eric said hi", "what's the forecast for tomorrow", "does he focus on backend", "indy cars are fast"];
console.log(safe.map((s) => `${s} -> ${fixNames(s)}`).join("\n"));
