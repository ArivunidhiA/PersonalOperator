import { describe, it, expect, beforeAll } from "vitest";

type Detector = {
  step(mic: number, out: number, active: boolean): "pause" | "resume" | "commit" | null;
  confirm(): "commit" | null;
  paused: boolean;
};
let make: () => Detector;
const RATE = 48000;
const BLOCK_MS = (128 / RATE) * 1000;
const blocks = (ms: number) => Math.round(ms / BLOCK_MS);

beforeAll(async () => {
  // @ts-expect-error plain worklet script, no types
  await import("../public/audio/barge-detector.js");
  const D = (globalThis as unknown as { BargeDetector: new (rate: number) => Detector }).BargeDetector;
  make = () => new D(RATE);
});

/** Speech-like agent output: syllables at ~4 Hz between 0.02 and 0.12. */
const agentAt = (i: number) => 0.07 + 0.05 * Math.sin((i * BLOCK_MS * 2 * Math.PI) / 250);

/** Runs the detector; mic = delayed echo of the output x coupling + noise + extra(i). */
function run(d: Detector, ms: number, opts: { coupling?: number; extra?: (i: number) => number; agent?: boolean; start?: number } = {}) {
  const { coupling = 0.12, extra = () => 0, agent = true, start = 0 } = opts;
  const delay = blocks(120);
  const out: number[] = [];
  const events: { t: number; e: string }[] = [];
  let playing = agent;
  for (let k = 0; k < blocks(ms); k++) {
    const i = start + k;
    const o = playing && !d.paused ? agentAt(i) : 0;
    out.push(o);
    const echo = (out[k - delay] ?? 0) * coupling;
    const mic = Math.hypot(echo, 0.002, extra(i));
    const e = d.step(mic, o, playing);
    if (e) events.push({ t: k * BLOCK_MS, e });
    if (e === "commit") playing = false; // the player flushed the reply
  }
  return events;
}

/** The caller talking from the same spot as before: level ~0.06, with syllable dips. */
const caller = (from: number, ms: number, level = 0.06) => (i: number) => {
  const t = i * BLOCK_MS - from;
  return t >= 0 && t < ms ? level * (0.75 + 0.25 * Math.sin((t * 2 * Math.PI) / 200)) : 0;
};

function learnCaller(d: Detector) {
  run(d, 1500, { agent: false, extra: caller(0, 1500) });
  run(d, 800, { agent: false });
}

describe("barge-in detector", () => {
  it("never stops the agent for its own echo", () => {
    const d = make();
    expect(run(d, 10_000)).toEqual([]);
  });

  it("pauses within ~40 ms of the caller and drops the reply after ~250 ms", () => {
    const d = make();
    learnCaller(d);
    const ev = run(d, 4000, { extra: caller(2000, 1500) });
    expect(ev[0].e).toBe("pause");
    expect(ev[0].t - 2000).toBeLessThan(45);
    const commit = ev.find((x) => x.e === "commit")!;
    expect(commit.t - 2000).toBeLessThan(320);
  });

  it("catches a caller before it has learned their voice", () => {
    const d = make();
    const ev = run(d, 4000, { extra: caller(2000, 1500) });
    expect(ev.map((x) => x.e)).toEqual(["pause", "commit"]);
  });

  it("resumes after a cough or a bang without dropping the reply", () => {
    const d = make();
    learnCaller(d);
    const ev = run(d, 4000, { extra: caller(2000, 90, 0.1) });
    expect(ev.map((x) => x.e)).toEqual(["pause", "resume"]);
  });

  it("ignores voices across the room once it knows the caller's level", () => {
    const d = make();
    learnCaller(d);
    expect(run(d, 5000, { extra: caller(1000, 3000, 0.012) })).toEqual([]);
  });

  it("lets a quieter voice pause the agent but never drop its reply", () => {
    const d = make();
    learnCaller(d);
    const ev = run(d, 5000, { extra: caller(1000, 3000, 0.018) });
    expect(ev.some((x) => x.e === "commit")).toBe(false);
    expect(ev.filter((x) => x.e === "pause").length).toBeLessThanOrEqual(2); // no stutter
    expect(d.paused).toBe(false);
  });

  it("still hears the caller right after ignoring a background voice", () => {
    const d = make();
    learnCaller(d);
    const ev = run(d, 5000, { extra: (i) => caller(500, 1500, 0.018)(i) + caller(2200, 1500)(i) });
    expect(ev.find((x) => x.e === "commit")!.t).toBeLessThan(2600);
  });

  it("learns a loud speaker: at most one false pause, never a dropped reply", () => {
    const d = make();
    const ev = run(d, 15_000, { coupling: 0.6 });
    expect(ev.filter((x) => x.e === "pause").length).toBeLessThanOrEqual(1);
    expect(ev.some((x) => x.e === "commit")).toBe(false);
  });

  it("trusts the server's 'caller started' only if it heard a voice too", () => {
    const d = make();
    learnCaller(d);
    run(d, 2000);
    expect(d.confirm()).toBeNull();
    run(d, 20, { extra: caller(0, 20) });
    expect(d.confirm()).toBe("commit");
  });
});
