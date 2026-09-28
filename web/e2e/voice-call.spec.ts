import { test, expect, type Page } from "@playwright/test";

/**
 * The release-blocking journey, through the real product surface:
 * open the site -> start a call -> the agent greets and says it's an AI ->
 * the caller (fake mic) asks where Ariv works -> correct answer -> caller asks
 * for links -> clickable links card -> end call -> transcript saved and
 * shareable (checked through the public share API).
 */
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} @ ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
};

test("voice call: greeting, facts, links card, saved transcript", async ({ page, request }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ariv's AI" })).toBeVisible();
  await expect(page.getByText(/Gemini API \(free tier\)/)).toBeVisible();

  const t0 = Date.now();
  await page.getByRole("button", { name: /start talking/i }).click();
  const log = page.getByRole("log");

  // Greeting arrives and discloses it's an AI.
  await expect(log).toContainText(/\bAI\b/, { timeout: 30_000 });
  const greetMs = Date.now() - t0;

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

  // End the call; the transcript is saved. Sharing is opt-in.
  const finished = page.waitForResponse((r) => r.url().includes("/api/calls/finish") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /end call/i }).click();
  const finishRes = await finished;
  expect(finishRes.status()).toBe(200);
  expect((await finishRes.json()).ok).toBe(true);
  await expect(page.getByText("Your transcript")).toBeVisible({ timeout: 30_000 });

  const shared = page.waitForResponse((r) => r.url().includes("/api/calls/share"), { timeout: 30_000 });
  await page.getByRole("button", { name: /create share link/i }).click();
  const shareRes = await shared;
  expect(shareRes.status()).toBe(200);
  const saved = await shareRes.json();
  expect(saved.share_token).toMatch(/^[0-9a-f]{32}$/);
  await expect(page.getByRole("button", { name: /copy share link/i })).toBeVisible();

  const view = await request.get(`/api/calls/${saved.share_token}`);
  expect(view.status()).toBe(200);
  expect(view.headers()["x-robots-tag"]).toContain("noindex");
  const call = await view.json();
  expect(JSON.stringify(call.transcript)).toMatch(/INZI/i);
  expect(call.verified).toBe(false);

  test.info().annotations.push({ type: "greeting_ms", description: String(greetMs) }, { type: "share_token", description: saved.share_token });
  // Off-Vercel, the analytics script 404s and a production Clerk key refuses localhost.
  expect(errors.filter((e) => !/_vercel\/insights|clerk|favicon/i.test(e))).toEqual([]);
});

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
