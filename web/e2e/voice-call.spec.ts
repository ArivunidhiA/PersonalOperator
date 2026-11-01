import { test, expect, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "path";

/**
 * The release-blocking journey, through the real product surface:
 * open the site -> start a call -> the agent greets -> the caller (fake mic)
 * asks where Ariv works -> correct answer -> asks for links -> clickable links
 * card -> asks for the booking link -> tagged Calendly link, clicked -> end
 * call -> transcript saved -> analytics rows
 * (visit, call start, click, call context) checked in the database, then the
 * test's own rows are deleted.
 */
config({ path: path.resolve(__dirname, "../.env.local") });
const db =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} @ ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
};

/** One row of e2e/corpus/manifest.jsonl (built by e2e/corpus/build_manifest.py). */
type CorpusEntry = { id: string; audio_filepath: string; voice: string; speed: number; noise: boolean; raw_text: string; text: string };
const corpus = process.env.E2E_CORPUS === "1";
const corpusDir = path.resolve(__dirname, "corpus");
const entries: CorpusEntry[] = corpus
  ? readFileSync(path.join(corpusDir, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as CorpusEntry)
  : [];

async function journey({ page }: { page: Page }, entry?: CorpusEntry) {
  const errors = errorsOf(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ariv's AI" })).toBeVisible();

  const t0 = Date.now();
  const sessionRes = page.waitForResponse((r) => r.url().includes("/api/voice/session") && r.request().method() === "POST");
  await page.getByRole("button", { name: /ask me/i }).click();
  const sid: string = (await (await sessionRes).json()).sessionId;
  expect(sid).toMatch(/^s_/);
  // The call screen shows one exchange; the full log lives in the popup.
  await page.getByRole("button", { name: /open full conversation/i }).click({ timeout: 30_000 });
  const log = page.getByRole("dialog").getByRole("log");

  // A natural greeting arrives (the agent shouldn't sound like an assistant).
  const firstLine = log.locator(":scope > div").first();
  await expect(firstLine).toBeVisible({ timeout: 30_000 });
  const greetMs = Date.now() - t0;
  expect((await firstLine.innerText()).toLowerCase()).not.toMatch(/how can i (help|assist)|i'm here to (help|assist)/);

  // Caller's first question is transcribed from the fake microphone...
  await expect(log).toContainText(/work/i, { timeout: 45_000 });
  // ...and answered from the fact card.
  await expect(log).toContainText(/INZI/i, { timeout: 45_000 });

  // Second question: links arrive as a clickable card, not spoken URLs.
  const linkedIn = log.getByRole("link", { name: /LinkedIn/ });
  await expect(linkedIn).toBeVisible({ timeout: 60_000 });
  await expect(linkedIn).toHaveAttribute("href", /^https:\/\/www\.linkedin\.com\/in\/arivunidhi-anna-arivan/);
  await expect(log.getByRole("link", { name: /GitHub/ })).toBeVisible();
  const agentText = (await log.innerText()).toLowerCase();
  expect(agentText).not.toMatch(/https?:|www\.|dot com/);

  // Third question: the booking link, tagged with this call so a booking can be traced back.
  const booking = log.getByRole("link", { name: /Book a 15-min chat/ });
  await expect(booking).toBeVisible({ timeout: 60_000 });
  await expect(booking).toHaveAttribute(
    "href",
    new RegExp(`^https://calendly\\.com/annaarivan-a-northeastern/15-min-coffee-chat\\?utm_source=arivsai&utm_medium=voice_agent&utm_content=${sid}$`),
  );
  // Clicking it opens Calendly in a new tab (nothing gets booked) and is recorded for Ariv's dashboard.
  const [calendly] = await Promise.all([page.waitForEvent("popup"), booking.click()]);
  await calendly.close();

  // Corpus mode: keep what the agent heard from this synthetic caller, for e2e/corpus/wer.py.
  if (entry) {
    const heard = (await log.locator(":scope > div").filter({ has: page.locator("span", { hasText: /^you$/i }) }).allInnerTexts()).map((t) => t.replace(/^\s*you\s*/i, "").trim());
    mkdirSync(path.join(corpusDir, "out"), { recursive: true });
    appendFileSync(path.join(corpusDir, "out", "results.jsonl"), JSON.stringify({ id: entry.id, ref: entry.text, heard: heard.join(" ") }) + "\n");
  }

  // Out of the popup, the same links stay one tap away beside the orb.
  await page.getByRole("button", { name: /close conversation/i }).click();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Book a 15-min chat/ })).toBeVisible();

  // End the call; the transcript is saved. Sharing is opt-in.
  const finished = page.waitForResponse((r) => r.url().includes("/api/calls/finish") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /^end$/i }).click();
  const finishRes = await finished;
  expect(finishRes.status()).toBe(200);
  expect((await finishRes.json()).ok).toBe(true);
  await expect(page.getByText("Your transcript")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole("button", { name: /share link/i })).toHaveCount(0);

  test.info().annotations.push({ type: "greeting_ms", description: String(greetMs) }, { type: "session_id", description: sid });

  // Analytics, checked at the source of truth (Supabase), then this test's rows are removed.
  if (db) {
    const vid = await page.evaluate(() => localStorage.getItem("ariv-vid"));
    expect(vid).toMatch(/^v_[0-9a-f]{24}$/);
    const types = async () => ((await db.from("site_events").select("type").or(`visitor_id.eq.${vid},session_id.eq.${sid}`)).data ?? []).map((e) => e.type as string);
    await expect.poll(types, { timeout: 20_000 }).toEqual(expect.arrayContaining(["visit", "call_start", "click"]));
    const { data: click } = await db.from("site_events").select("label, target, is_bot").eq("session_id", sid).eq("type", "click").limit(1).single();
    expect(click).toMatchObject({ label: "Book a 15-min chat", target: "calendly.com", is_bot: true });
    const { data: row, error } = await db.from("call_summaries").select("visitor_id, questions, duration_s, is_bot, context").eq("session_id", sid).single();
    expect(error).toBeNull();
    expect(row!.visitor_id).toBe(vid);
    expect(row!.is_bot).toBe(true); // headless test browsers are kept out of Ariv's numbers
    expect((row!.questions as string[]).join(" ")).toMatch(/work/i);
    expect(row!.duration_s).toBeGreaterThan(20);
    expect((row!.context as { clicks?: string[] }).clicks ?? []).toEqual(expect.arrayContaining(["Book a 15-min chat"]));
    // Against a deployment (email on), Resend's id for Ariv's call email is kept on the call (F-05).
    // Locally the test server runs with email off.
    if (process.env.E2E_BASE_URL) {
      expect((row!.context as { notified?: { emailId?: string } }).notified?.emailId).toMatch(/^[\w-]{8,}$/);
    }
    // Evidence for the QA report (printed before the rows are deleted).
    const { data: evidence } = await db.from("site_events").select("type, label, target, country, region, city, device, browser, os, is_bot, is_owner").or(`visitor_id.eq.${vid},session_id.eq.${sid}`);
    console.log("E2E_ANALYTICS_EVIDENCE", JSON.stringify({ sid, vid, events: evidence, call: { ...row, questions: row!.questions } }));
    await db.from("site_events").delete().or(`visitor_id.eq.${vid},session_id.eq.${sid}`);
    await db.from("share_tokens").delete().eq("session_id", sid);
    await db.from("call_summaries").delete().eq("session_id", sid);
  }
  // Off-Vercel, the analytics script 404s and a production Clerk key refuses localhost.
  expect(errors.filter((e) => !/_vercel\/insights|clerk|favicon/i.test(e))).toEqual([]);
}

if (corpus) {
  // E2E_CORPUS=1: the same journey once per synthetic caller (voice / speed / noise) in the manifest.
  for (const entry of entries) {
    test.describe(`corpus caller ${entry.id}`, () => {
      test.use({
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-audio-capture=${path.resolve(corpusDir, entry.audio_filepath)}`,
            "--autoplay-policy=no-user-gesture-required",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        },
      });
      test("voice call: greeting, facts, links card, saved transcript", async ({ page }) => journey({ page }, entry));
    });
  }
} else {
  test("voice call: greeting, facts, links card, saved transcript", async ({ page }) => journey({ page }));
}

test("security surface: old open endpoints are gone, new ones need a live-call ticket", async ({ request }) => {
  for (const path of ["/api/tools/send-email", "/api/tools/caller-memory", "/api/tools/post-call", "/api/tools/rag", "/api/realtime/token", "/api/realtime/connect"]) {
    const r = await request.post(path, { data: { to: "victim@example.com", subject: "x", html: "x", email: "a@b.co" } });
    expect(r.status(), path).toBe(404);
  }
  expect((await request.post("/api/voice/session", { data: {} })).status()).toBe(403); // no cross-site/scripted starts
  expect((await request.post("/api/tools/execute", { data: { name: "share_links", args: {} } })).status()).toBe(401);
  expect((await request.post("/api/calls/share", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/calls/finish", { data: { messages: [{ role: "user", text: "hi" }] } })).status()).toBe(401);
  expect((await request.post("/api/calls/email", { data: {} })).status()).toBe(401);
  expect((await request.get("/api/cron/maintenance")).status()).toBe(401);
});

test("security headers are set", async ({ request }) => {
  const r = await request.get("/");
  const h = r.headers();
  expect(h["permissions-policy"]).toContain("microphone=(self)");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});
