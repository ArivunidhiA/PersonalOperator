import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

/**
 * Live captions in the real page, muted.
 * The first group fakes Web Speech and Gemini to pin the display rules.
 * E2E_LIVE_CAPTIONS=1 adds one real call in real Chrome: real Web Speech, real Gemini, a file as the mic.
 * /api routes stay faked, so nothing reaches production data. Build e2e/corpus/audio/captions/live-call.wav first.
 *   npm run build && E2E_CHANNEL=chrome npx playwright test e2e/live-caption.spec.ts
 */
config({ path: path.resolve(__dirname, "../.env.local") });
const liveWav = path.resolve(__dirname, "corpus/audio/captions/live-call.wav");
const live = process.env.E2E_LIVE_CAPTIONS === "1";
test.use({
  channel: process.env.E2E_CHANNEL,
  launchOptions: {
    args: [
      "--mute-audio",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      ...(live ? [`--use-file-for-fake-audio-capture=${liveWav}%noloop`] : []),
    ],
  },
});

/** Stands in for Chrome's SpeechRecognition; window.__sr.emit(text, final) plays a result. */
const fakeSpeech = (failStart = false) => `
  class FakeSR {
    static available() { return Promise.resolve("available"); }
    start() {
      if (${failStart}) throw new Error("no speech service");
      window.__sr = this; this.results = []; window.__srStarts = (window.__srStarts || 0) + 1;
    }
    abort() {}
    emit(text, final) {
      const r = { isFinal: final, 0: { transcript: text } };
      this.results = this.results.filter((x) => x.isFinal).concat(r); // Chrome keeps finished results
      this.onresult({ resultIndex: 0, results: this.results });
    }
  }
  window.SpeechRecognition = FakeSR;
`;

async function mockCalls(page: Page, session?: object) {
  const saved: { messages?: { role: string; text: string }[] } = {};
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/voice/session")) {
      return route.fulfill({ json: session ?? { provider: "gemini", sessionId: "s_mock", ticket: "t", maxCallSeconds: 300, gemini: { token: "x", model: "m", wsUrl: "wss://mock.test/ws", greeting: "hi" } } });
    }
    if (url.includes("/api/calls/finish")) {
      Object.assign(saved, JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ json: { ok: true, summary: "Done." } });
    }
    return route.fulfill({ json: { ok: true, result: "done" } });
  });
  return saved;
}

async function mockedCall(page: Page, init?: string) {
  const sockets: WebSocketRoute[] = [];
  const saved = await mockCalls(page);
  await page.routeWebSocket(/mock\.test/, (ws) => {
    sockets.push(ws);
    ws.onMessage((m) => {
      if (String(m).includes('"setup"')) ws.send(JSON.stringify({ setupComplete: {} }));
    });
  });
  if (init !== undefined) await page.addInitScript(init);
  await page.goto("/");
  await page.getByRole("button", { name: /ask me/i }).click();
  await expect(page.getByRole("button", { name: /^end$/i })).toBeVisible();
  const send = (msg: object) => sockets.at(-1)!.send(JSON.stringify(msg));
  return { saved, sockets, send, gemini: (text: string) => send({ serverContent: { inputTranscription: { text } } }) };
}
const emit = (page: Page, text: string, final = false) => page.evaluate(([t, f]) => (window as never as { __sr: { emit(a: unknown, b: unknown): void } }).__sr.emit(t, f), [text, final]);
const strip = (p: Page) => p.locator("[data-strip]");

test.describe("display", () => {
  test.skip(live, "the live call below runs on its own");

  test("partials replace in place, the tail is dimmer, Gemini's text takes over the same line", async ({ page }) => {
    const { gemini, send, saved } = await mockedCall(page, fakeSpeech());
    await expect.poll(() => page.evaluate(() => (window as never as { __sr?: object }).__sr !== undefined)).toBe(true);
    await emit(page, "where");
    const line = strip(page).locator("p").filter({ hasText: "where" }).first();
    await expect(line).toBeVisible();
    await line.evaluate((el) => ((window as never as { __line: Element }).__line = el));
    await emit(page, "where does");
    await emit(page, "where does Eric work");
    await expect(line).toContainText("where does Ariv work");
    expect(await line.locator("span").count()).toBeGreaterThan(0); // the unsettled tail
    await emit(page, "where does Eric work", true);
    await gemini("Where does Ariv work?");
    await expect(strip(page).getByText("Where does Ariv work?")).toBeVisible();
    // Same item id, so the same element was edited: no enter animation, no jump.
    const same = await page.evaluate(() => {
      const w = window as never as { __line: Element };
      return w.__line.isConnected && /Where does Ariv work\?/.test(w.__line.textContent ?? "");
    });
    expect(same).toBe(true);
    await expect(page.getByRole("log", { name: "Latest in the conversation" })).not.toContainText("where does");
    send({ serverContent: { outputTranscription: { text: "He works at INZI Controls." } } });
    send({ serverContent: { turnComplete: true } });
    await expect(page.getByText("He works at INZI Controls.").first()).toBeAttached();
    await page.getByRole("button", { name: /^end$/i }).click();
    await expect.poll(() => saved.messages?.filter((m) => m.role === "user").map((m) => m.text)).toEqual(["Where does Ariv work?"]);
  });

  test("captions keep working through a reconnect", async ({ page }) => {
    const { sockets } = await mockedCall(page, fakeSpeech());
    await expect.poll(() => page.evaluate(() => (window as never as { __sr?: object }).__sr !== undefined)).toBe(true);
    await emit(page, "before the drop", true);
    await expect(strip(page)).toContainText("before the drop");
    await sockets[0].close({ code: 4001, reason: "Internal error" });
    await expect.poll(() => sockets.length, { timeout: 8000 }).toBeGreaterThan(1);
    await emit(page, "after the drop");
    await expect(strip(page)).toContainText("after the drop");
    expect(await page.evaluate(() => (window as never as { __srStarts: number }).__srStarts)).toBe(1);
  });

  test("speech service failing leaves the call and Gemini's text alone", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const { gemini } = await mockedCall(page, fakeSpeech(true));
    gemini("Is this thing on?");
    await expect(strip(page).getByText("Is this thing on?")).toBeVisible();
    await expect(page.getByRole("button", { name: /^end$/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("unsupported browser: Gemini's text still shows", async ({ page }) => {
    const { gemini } = await mockedCall(page, "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;");
    gemini("Still here?");
    await expect(strip(page).getByText("Still here?")).toBeVisible();
  });
});

test.describe("real call", () => {
  test.skip(!live, "set E2E_LIVE_CAPTIONS=1");
  test.setTimeout(150_000);

  test("real Web Speech captions a real Gemini call, ahead of Gemini's text", async ({ page }) => {
    // Minted beforehand with lib/gemini-token.ts: { token, model, wsUrl, greeting }. Short-lived, gitignored path.
    const gemini = JSON.parse(fs.readFileSync(process.env.E2E_GEMINI_SESSION!, "utf8"));
    const saved = await mockCalls(page, { provider: "gemini", sessionId: "s_caption", ticket: "t", maxCallSeconds: 300, gemini });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      const w = window as never as { __t: { at: number; text: string; caption: boolean }[] };
      w.__t = [];
      let last = "";
      setInterval(() => {
        const el = document.querySelector("[data-strip] p");
        const text = el?.textContent ?? "";
        if (text === last) return;
        last = text;
        w.__t.push({ at: performance.now(), text, caption: !!el?.querySelector("span") });
      }, 30);
    });
    await page.goto("/");
    await page.getByRole("button", { name: /ask me/i }).click();
    await expect(page.getByRole("button", { name: /^end$/i })).toBeVisible({ timeout: 30_000 });
    await expect(strip(page)).toContainText(/INZI|controls/i, { timeout: 45_000 });
    await page.waitForTimeout(45_000);
    await page.getByRole("button", { name: /^end$/i }).click();
    await expect.poll(() => saved.messages?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(1);
    const trace = await page.evaluate(() => (window as never as { __t: unknown[] }).__t);
    const dir = path.resolve(__dirname, "corpus/out/captions/module");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "real-call.json"), JSON.stringify({ trace, saved, errors }, null, 1));
    expect(errors).toEqual([]);
    expect((trace as { caption: boolean }[]).filter((t) => t.caption).length).toBeGreaterThan(5);
  });
});
