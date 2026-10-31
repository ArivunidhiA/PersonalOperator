import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveCaptionSupported, looksLikeEcho, settledChars, startLiveCaption, type Caption } from "@/lib/voice/live-caption";
import { fixNames } from "@/lib/voice/live-caption-names";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (Macintosh; rv:140.0) Gecko/20100101 Firefox/140.0";

class FakeRec {
  static last: FakeRec | null = null;
  static count = 0;
  static availability: string | Error = "available";
  static startThrows = false;
  static available = () => (FakeRec.availability instanceof Error ? Promise.reject(FakeRec.availability) : Promise.resolve(FakeRec.availability));
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  track: unknown = null;
  aborted = false;
  start(track: unknown) {
    if (FakeRec.startThrows) throw new Error("no");
    this.track = track;
    FakeRec.last = this;
    FakeRec.count++;
  }
  abort() {
    this.aborted = true;
  }
  emit(...results: [string, boolean][]) {
    this.onresult?.({ resultIndex: 0, results: Object.assign(results.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })), {}) });
  }
}

const fakeWindow = (ua = CHROME, Rec: unknown = FakeRec) => ({ navigator: { userAgent: ua }, SpeechRecognition: Rec }) as unknown as Window;
const fakeTrack = () => {
  const clone = { stop: vi.fn() };
  return { track: { clone: () => clone } as unknown as MediaStreamTrack, clone };
};

async function begin() {
  const shown: Caption[] = [];
  const onCancel = vi.fn();
  const onUnavailable = vi.fn();
  const { track, clone } = fakeTrack();
  const lc = startLiveCaption(track, { onCaption: (c) => shown.push(c), onCancel, onUnavailable }, fakeWindow())!;
  await vi.advanceTimersByTimeAsync(0);
  return { lc, shown, onCancel, onUnavailable, clone, rec: FakeRec.last! };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeRec.last = null;
  FakeRec.count = 0;
  FakeRec.availability = "available";
  FakeRec.startThrows = false;
});
afterEach(() => vi.useRealTimers());

describe("support", () => {
  it("desktop Chrome with available() is supported", () => expect(liveCaptionSupported(fakeWindow())).toBe(true));
  it("iOS Safari is not, even with the old API", () => expect(liveCaptionSupported(fakeWindow(SAFARI))).toBe(false));
  it("Firefox is not", () => expect(liveCaptionSupported(fakeWindow(FIREFOX, undefined))).toBe(false));
  it("an old Chrome without available() is not", () => {
    expect(liveCaptionSupported(fakeWindow(CHROME, class {}))).toBe(false);
  });
  it("NEXT_PUBLIC_LIVE_CAPTIONS=0 turns captions off", () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_CAPTIONS", "0");
    expect(liveCaptionSupported(fakeWindow())).toBe(false);
    vi.unstubAllEnvs();
  });
  it("unsupported returns null and touches nothing", () => {
    const { track } = fakeTrack();
    expect(startLiveCaption(track, { onCaption: () => {} }, fakeWindow(FIREFOX, undefined))).toBeNull();
    expect(FakeRec.count).toBe(0);
  });
});

describe("captions", () => {
  it("uses a clone of the mic track and leaves the original alone", async () => {
    const { rec, clone, lc } = await begin();
    expect(rec.track).toBe(clone);
    lc.stop();
    expect(clone.stop).toHaveBeenCalled();
    expect(rec.aborted).toBe(true);
  });

  it("passes partials through as they change, with what has settled", async () => {
    const { rec, shown } = await begin();
    rec.emit(["where", false]);
    rec.emit(["where does", false]);
    rec.emit(["where does he", false]);
    expect(shown.map((c) => c.text)).toEqual(["where", "where does", "where does he"]);
    expect(shown[0].settled).toBe(0);
    expect(shown[2].settled).toBe("where does".length);
  });

  it("a replaced word un-settles from that word on", () => {
    expect(settledChars("where does eric", "where does he work")).toBe("where does".length);
  });

  it("moves to a new utterance after a final", async () => {
    const { rec, shown } = await begin();
    rec.emit(["hello there", true]);
    rec.emit(["hello there", true], ["next one", false]);
    expect(shown.map((c) => [c.utterance, c.text, c.final])).toEqual([
      [1, "hello there", true],
      [2, "next one", false],
    ]);
  });

  it("fixes known names in what it shows", async () => {
    const { rec, shown } = await begin();
    rec.emit(["where does Eric work at NZ controls", false]);
    expect(shown[0].text).toBe("where does Ariv work at INZI controls");
  });
});

describe("echo", () => {
  const AGENT = "He built forecost to predict what a coding agent will cost before it runs";

  it("flags the agent's words and passes the caller's own", () => {
    const heard = AGENT.toLowerCase().split(" ");
    expect(looksLikeEcho("he built forecost to predict", heard)).toBe(true);
    expect(looksLikeEcho("wait what about his github", heard)).toBe(false);
  });

  it("never shows the agent's voice while it speaks", async () => {
    const { rec, shown, lc } = await begin();
    lc.setAgentSpeaking(true);
    lc.addAgentText(AGENT);
    rec.emit(["he built forecost", false]);
    rec.emit(["he built forecost to predict what", false]);
    rec.emit(["he built forecast to predict what a coding", true]);
    lc.setAgentSpeaking(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(shown).toEqual([]);
  });

  it("the tail right after the agent stops is held too", async () => {
    const { rec, shown, lc } = await begin();
    lc.setAgentSpeaking(true);
    lc.addAgentText(AGENT);
    lc.setAgentSpeaking(false);
    await vi.advanceTimersByTimeAsync(100);
    rec.emit(["before it runs", false]);
    expect(shown).toEqual([]);
  });

  it("barge-in releases what the caller said over the agent", async () => {
    const { rec, shown, lc } = await begin();
    lc.setAgentSpeaking(true);
    lc.addAgentText(AGENT);
    rec.emit(["wait hold on", false]);
    expect(shown).toEqual([]);
    lc.bargeIn();
    expect(shown.map((c) => c.text)).toEqual(["wait hold on"]);
    rec.emit(["wait hold on a second", false]);
    expect(shown.at(-1)?.text).toBe("wait hold on a second");
  });

  it("a shown line that turns into the agent's words is withdrawn", async () => {
    const { rec, onCancel, lc } = await begin();
    rec.emit(["okay", false]);
    lc.addAgentText(AGENT);
    lc.setAgentSpeaking(true);
    rec.emit(["he built forecost", false]);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("failure never reaches the call", () => {
  it("a fatal error stops captions and reports once", async () => {
    const { rec, onUnavailable, clone } = await begin();
    rec.onerror?.({ error: "network" });
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith("network");
    expect(clone.stop).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeRec.count).toBe(1);
  });

  it("restarts after the service ends a session", async () => {
    const { rec } = await begin();
    await vi.advanceTimersByTimeAsync(60_000);
    rec.onend?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeRec.count).toBe(2);
  });

  it("gives up on a tight restart loop", async () => {
    const { onUnavailable } = await begin();
    for (let i = 0; i < 6; i++) {
      FakeRec.last?.onend?.();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith("restart-loop");
  });

  it("a throwing start reports unavailable, doesn't throw", async () => {
    FakeRec.startThrows = true;
    const { onUnavailable } = await begin();
    expect(onUnavailable).toHaveBeenCalledWith("start-failed");
  });

  it("no cloud service available ends captions", async () => {
    FakeRec.availability = "unavailable";
    const { onUnavailable } = await begin();
    expect(onUnavailable).toHaveBeenCalledWith("unavailable");
    expect(FakeRec.count).toBe(0);
  });

  it("a throwing onCaption is swallowed", async () => {
    const { track } = fakeTrack();
    startLiveCaption(track, { onCaption: () => { throw new Error("ui bug"); } }, fakeWindow());
    await vi.advanceTimersByTimeAsync(0);
    expect(() => FakeRec.last!.emit(["hello", false])).not.toThrow();
  });
});

describe("mute", () => {
  it("stops listening while muted and resumes after", async () => {
    const { rec, shown, lc } = await begin();
    lc.setMuted(true);
    expect(rec.aborted).toBe(true);
    rec.emit(["private aside", false]);
    expect(shown).toEqual([]);
    lc.setMuted(false);
    expect(FakeRec.count).toBe(2);
  });
});

describe("names", () => {
  it("leaves ordinary words alone", () => {
    for (const s of ["what's the forecast for tomorrow", "does he focus on backend", "indy cars are fast", "my friend Eric said hi"]) expect(fixNames(s)).toBe(s);
  });
  it("fixes Eric only in a phrase about Ariv", () => {
    expect(fixNames("where does Eric work")).toBe("where does Ariv work");
    expect(fixNames("whether Eric would be a good fit")).toBe("whether Ariv would be a good fit");
  });
});
