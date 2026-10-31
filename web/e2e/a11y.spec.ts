import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Non-voice accessibility scan (axe, WCAG 2 A/AA) of the pages that render
 * without a call. No microphone or Gemini needed.
 *   npm run build && npx playwright test e2e/a11y.spec.ts
 * Fails on serious/critical violations only; moderate/minor are logged.
 */
const scan = async (page: import("@playwright/test").Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.length} node(s) - ${v.help}`);
  if (summary.length) console.log(summary.join("\n"));
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical");
};

test("home has no serious/critical a11y violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ariv's AI" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("/privacy has no serious/critical a11y violations", async ({ page }) => {
  const res = await page.goto("/privacy");
  test.skip(!res || res.status() === 404, "/privacy does not exist yet");
  expect(await scan(page)).toEqual([]);
});

test("/call/[token] not-found state has no serious/critical a11y violations", async ({ page }) => {
  await page.goto(`/call/${"deadbeef".repeat(4)}`);
  // Without Supabase the API answers 503, so accept any terminal error state.
  await expect(page.getByText(/not found|failed to load|expired/i)).toBeVisible();
  expect(await scan(page)).toEqual([]);
});
