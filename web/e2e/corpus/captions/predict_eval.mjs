// Prediction test: given what the caller has said so far (perfect partial text, the best case), can a
// fast model guess the next two words, and how fast? Text only, silent. usage: node predict_eval.mjs [model]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const key = /^GEMINI_API_KEY=["']?([^"'\n]+)/m.exec(fs.readFileSync(path.join(here, "../../../.env.local"), "utf8"))?.[1];
const model = process.argv[2] ?? "gemini-flash-latest";
const cfg = JSON.parse(fs.readFileSync(path.join(here, "captions.json")));
const clean = (s) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
const rows = [];
const fetchSafe = (...a) => fetch(...a).catch((e) => ({ ok: false, json: async () => ({ error: { status: e.name } }) }));
for (const turn of cfg.turns) {
  const w = clean(turn);
  for (const f of [0.4, 0.7]) {
    const k = Math.max(2, Math.floor(w.length * f));
    const prefix = w.slice(0, k).join(" ");
    const t = performance.now();
    const r = await fetchSafe(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      signal: AbortSignal.timeout(15000), method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You predict live speech. A caller is asking a voice agent about Ariv, an engineer who worked at INZI Controls and built forecost, Registrum and Malbit, and uses Agno, pgvector and NeMo Curator. Output only the next two words the caller will say." }] },
        contents: [{ parts: [{ text: prefix }] }],
        generationConfig: { maxOutputTokens: 40, temperature: 0 },
      }),
    });
    const ms = performance.now() - t;
    const j = await r.json();
    const guess = clean(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    rows.push({ prefix, truth: w.slice(k, k + 2), guess: guess.slice(0, 2), ms: Math.round(ms), ok: r.ok, err: j.error?.status });
    await new Promise((res) => setTimeout(res, 4500));
  }
}
const good = rows.filter((r) => r.ok);
const both = good.filter((r) => r.guess.join(" ") === r.truth.join(" ")).length;
const one = good.filter((r) => r.guess[0] === r.truth[0]).length;
const ms = good.map((r) => r.ms).sort((a, b) => a - b);
console.log(JSON.stringify({ model, n: good.length, failed: rows.length - good.length, nextWordRight: one, bothRight: both, wrongShown: good.length - one, ms_p50: ms[ms.length >> 1], ms_min: ms[0] }));
fs.mkdirSync(path.join(here, "../out/captions/extra"), { recursive: true });
fs.writeFileSync(path.join(here, "../out/captions/extra/predict.json"), JSON.stringify(rows, null, 1));
for (const r of rows) console.log(r.ms, r.prefix, "| truth:", r.truth.join(" "), "| guess:", r.guess.join(" "), r.err ?? "");
