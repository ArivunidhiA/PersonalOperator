/**
 * Live eval: the real voice model with the production session config (locked
 * Gemini ephemeral token, or OpenAI with EVAL_PROVIDER=openai) and the real
 * tool executor (fact registry, role research, Calendly). No tool can email
 * anyone or read caller data, so nothing needs stubbing.
 *
 * Run: npm run eval:live            (EVAL_REPEATS=3 by default)
 * Needs GEMINI_API_KEY (or OPENAI_API_KEY with EVAL_PROVIDER=openai).
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { makeHarness, type TurnResult } from "./harness";
import { CASES, UNIVERSAL } from "./cases";

const REPEATS = Number(process.env.EVAL_REPEATS || 3);
const ONLY = process.env.EVAL_ONLY?.split(",");
const MIN_PASS_RATE = Number(process.env.EVAL_MIN_PASS_RATE || 1);

type Row = { case: string; run: number; check: string; pass: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const blocked: { case: string; run: number }[] = [];
const rows: Row[] = [];
const transcripts: { case: string; run: number; turns: TurnResult[] }[] = [];

describe.sequential("live agent eval", () => {
  for (const c of CASES.filter((x) => !ONLY || ONLY.includes(x.id))) {
    it(
      c.id,
      async () => {
        for (let run = 1; run <= REPEATS; run++) {
          // A rate-limited run says nothing about the agent: wait out the
          // window and redo the whole conversation. Never counted as a pass.
          let turns: TurnResult[] = [];
          for (let attempt = 1; attempt <= 4; attempt++) {
            const h = makeHarness();
            turns = [];
            try {
              await h.open();
              for (const u of c.turns) turns.push(await h.turn(u));
            } catch (err) {
              if (!/rate_limit_exceeded|exhaust|quota|RESOURCE|429/i.test(String(err))) throw err;
              turns.push({ user: null, spoken: [], toolCalls: [], firstAudioMs: null, totalMs: 0, errors: [], rateLimited: true });
            } finally {
              h.close();
            }
            if (!turns.some((t) => t.rateLimited)) break;
            console.log(`[${c.id}] run ${run} rate-limited (attempt ${attempt}), waiting 65s`);
            await sleep(65_000);
          }
          if (turns.some((t) => t.rateLimited)) {
            blocked.push({ case: c.id, run });
            continue;
          }
          transcripts.push({ case: c.id, run, turns });
          for (const check of [...c.checks, ...UNIVERSAL]) {
            rows.push({ case: c.id, run, check: check.name, pass: check.pass(turns) });
          }
        }
        const mine = rows.filter((r) => r.case === c.id);
        const failed = mine.filter((r) => !r.pass);
        const byCheck = new Map<string, number>();
        for (const r of mine) byCheck.set(r.check, (byCheck.get(r.check) || 0) + (r.pass ? 1 : 0));
        const runs = REPEATS - blocked.filter((b) => b.case === c.id).length;
        expect(runs, `${c.id}: every run was blocked by rate limits`).toBeGreaterThan(0);
        for (const [check, passes] of byCheck) {
          expect.soft(passes / runs, `${c.id}: ${check} (${passes}/${runs})`).toBeGreaterThanOrEqual(MIN_PASS_RATE);
        }
        if (failed.length) console.log(`[${c.id}] failures:`, failed.map((f) => `${f.check} (run ${f.run})`).join("; "));
      },
      900_000,
    );
  }

  afterAll(() => {
    const dir = path.join(__dirname, ".results");
    fs.mkdirSync(dir, { recursive: true });
    const label = process.env.EVAL_LABEL || "run";
    const file = path.join(dir, `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const latency = transcripts.flatMap((t) => t.turns.slice(1).map((x) => x.firstAudioMs)).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const pct = (p: number) => latency[Math.min(latency.length - 1, Math.floor(p * latency.length))];
    const summary = {
      repeats: REPEATS,
      checks: rows.length,
      blockedRuns: blocked,
      passed: rows.filter((r) => r.pass).length,
      firstAudioMs: latency.length ? { p50: pct(0.5), p90: pct(0.9), max: latency[latency.length - 1] } : null,
    };
    fs.writeFileSync(file, JSON.stringify({ summary, rows, transcripts }, null, 2));
    console.log("EVAL SUMMARY", JSON.stringify(summary), "->", file);
  });
});
