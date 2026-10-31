import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const dir = path.resolve(__dirname, "../e2e/corpus");
const rows = readFileSync(path.join(dir, "manifest.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { id: string; audio_filepath: string; speed: number; noise: boolean; raw_text: string; text: string });
const callers = JSON.parse(readFileSync(path.join(dir, "callers.json"), "utf8")) as { callers: { id: string }[] };

// Mirrors NORMALIZE in build_manifest.py / sdp-normalize.yaml.
const normalize = (t: string) =>
  t.toLowerCase().replace(/&/g, " and ").replace(/[‘’ʼ′]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");

describe("e2e corpus manifest", () => {
  it("has one row per caller, with speeds within +-15%", () => {
    expect(rows.map((r) => r.id)).toEqual(callers.callers.map((c) => c.id));
    for (const r of rows) {
      expect(r.audio_filepath).toBe(`audio/${r.id}.wav`);
      expect(r.speed).toBeGreaterThanOrEqual(0.85);
      expect(r.speed).toBeLessThanOrEqual(1.15);
    }
    expect(rows.some((r) => r.noise)).toBe(true);
  });
  it("reference text is normalized to the SDP alphabet", () => {
    for (const r of rows) {
      expect(r.text).toMatch(/^[a-z' ]+$/);
      expect(r.text).toBe(normalize(r.raw_text));
    }
    expect(rows[0].text).toContain("linkedin and github");
  });
});
