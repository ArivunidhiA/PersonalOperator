import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Call screen layout, driven through the real page with the network faked:
 * the Gemini socket and every /api route are mocked, so no quota is used, no
 * audio is ever sent to the speakers and nothing reaches production data.
 * The live journey stays in voice-call.spec.ts.
 *   npm run build && npx playwright test e2e/transcript-ui.spec.ts
 */
test.use({ channel: process.env.E2E_CHANNEL, launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

const LINKS_CARD = { id: "c1", kind: "links", title: "Ariv's links", links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/x" }, { label: "GitHub", url: "https://github.com/x" }] };
const BOOKING_CARD = { id: "c2", kind: "booking", title: "15-min chat", when: "Tue Nov 3, 3:00 PM ET", url: "https://calendly.com/x/slot" };
const RECAP_CARD = { id: "c3", kind: "recap", title: "Recap", lines: ["Works at INZI Controls", "Building every day"] };
const LONG_REPLY = Array.from({ length: 90 }, (_, i) => `word${i}`).join(" ");

const orb = (p: Page) => p.locator('[aria-label="Call"] > div').first();
const strip = (p: Page) => p.locator("[data-strip]");
const expand = (p: Page) => p.getByRole("button", { name: /full conversation/i });
const popup = (p: Page) => p.getByRole("dialog");

/** Everything the page would talk to, faked. Returns the socket once the call opens it. */
async function mockNetwork(page: Page) {
  let socket: WebSocketRoute | null = null;
  const cards: Record<string, object> = { share_links: LINKS_CARD, schedule_meeting: BOOKING_CARD, generate_summary: RECAP_CARD };
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/voice/session")) {
      return route.fulfill({ json: { provider: "gemini", sessionId: "s_mock", ticket: "t", maxCallSeconds: 300, gemini: { token: "x", model: "m", wsUrl: "wss://mock.test/live", greeting: "hi" } } });
    }
    if (url.includes("/api/tools/execute")) {
      const { name } = route.request().postDataJSON() as { name: string };
      return route.fulfill({ json: { ok: true, result: "done", card: cards[name] } });
    }
    if (url.includes("/api/calls/finish")) return route.fulfill({ json: { ok: true, summary: "Talked about Ariv's work." } });
    if (url.includes("/api/calls/share")) return route.fulfill({ json: { share_token: "a".repeat(32) } });
    return route.fulfill({ json: {} });
  });
  await page.routeWebSocket(/mock\.test/, (ws) => {
    socket = ws;
    ws.onMessage((m) => {
      if (String(m).includes('"setup"')) ws.send(JSON.stringify({ setupComplete: {} }));
    });
  });
  const send = (msg: object) => {
    if (!socket) throw new Error("socket not open");
    socket.send(JSON.stringify(msg));
  };
  return {
    agent: (text: string) => send({ serverContent: { outputTranscription: { text } } }),
    agentDone: () => send({ serverContent: { turnComplete: true } }),
    user: (text: string, finished = true) => send({ serverContent: { inputTranscription: { text, finished } } }),
    tool: (name: string) => send({ toolCall: { functionCalls: [{ id: name, name }] } }),
  };
}
type Call = Awaited<ReturnType<typeof mockNetwork>>;

async function startCall(page: Page): Promise<Call> {
  const call = await mockNetwork(page);
  await page.goto("/");
  await page.getByRole("button", { name: /ask me/i }).click();
  await expect(page.getByRole("button", { name: /^end$/i })).toBeVisible();
  return call;
}

async function exchange(page: Page, call: Call) {
  call.agent("Hey, I'm Ariv's AI.");
  call.agentDone();
  call.user("Where does he work?");
  call.agent("He works at INZI Controls.");
  call.agentDone();
  await expect(page.getByText("He works at INZI Controls.").first()).toBeAttached();
}

for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["short laptop", { width: 1280, height: 720 }], ["phone", { width: 375, height: 812 }]] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test("orb and controls never move, from idle through a long reply", async ({ page }) => {
      const call = await mockNetwork(page);
      await page.goto("/");
      const box = () => orb(page).boundingBox();
      // The pill's label changes, so its width does; its centre and row may not.
      const pill = async () => {
        const b = (await page.locator('[aria-label="Call"] button').first().boundingBox())!;
        return { centre: b.x + b.width / 2, y: b.y, height: b.height };
      };
      const before = await box();
      const pillBefore = await pill();
      await page.getByRole("button", { name: /ask me/i }).click();
      await expect(page.getByRole("button", { name: /^end$/i })).toBeVisible();
      expect(await box()).toEqual(before);
      expect(await pill()).toEqual(pillBefore);
      await exchange(page, call);
      call.tool("share_links");
      await expect(page.getByText("GitHub").first()).toBeAttached();
      // The live guard holds a turn's last word until the turn ends: nothing may move either side of that.
      call.agent(LONG_REPLY);
      await expect(page.getByText(/word88/).first()).toBeAttached();
      await expect(page.getByText(/word89/)).toHaveCount(0);
      await page.waitForTimeout(400);
      expect(await box()).toEqual(before);
      expect(await pill()).toEqual(pillBefore);
      call.agentDone();
      await expect(page.getByText(/word89/).first()).toBeAttached();
      await page.waitForTimeout(400);
      expect(await box()).toEqual(before);
      expect(await pill()).toEqual(pillBefore);
    });

    test("nothing overflows the page sideways or under the footer", async ({ page }) => {
      const call = await startCall(page);
      await exchange(page, call);
      call.agent(LONG_REPLY);
      call.tool("schedule_meeting");
      call.tool("share_links");
      await expect(page.getByRole("link", { name: /github/i }).first()).toBeAttached();
      const wide = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth <= cw) return [];
        return [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > cw).map((e) => `${e.tagName}.${e.className}`.slice(0, 80));
      });
      expect(wide).toEqual([]);
      const s = (await strip(page).boundingBox())!;
      expect(s.y + s.height).toBeLessThanOrEqual(viewport.height);
      const footer = (await page.getByRole("link", { name: /privacy/i }).boundingBox())!;
      expect(s.y + s.height).toBeLessThanOrEqual(footer.y);
      expect((await orb(page).boundingBox())!.y + (await orb(page).boundingBox())!.height).toBeLessThanOrEqual(s.y);
    });
  });
}

test("strip is an invisible box with only the latest user line and AI reply", async ({ page }) => {
  const call = await startCall(page);
  await exchange(page, call);
  call.user("And before that?");
  call.agent("Hyundai, as an intern.");
  call.agentDone();
  await expect(strip(page)).toContainText("And before that?");
  await expect(strip(page)).toContainText("Hyundai, as an intern.");
  await expect(strip(page)).not.toContainText("Where does he work?", { timeout: 2000 });
  await expect(strip(page)).not.toContainText("INZI");
  const css = await strip(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopWidth, bg: s.backgroundColor };
  });
  expect(css).toEqual({ border: "0px", bg: "rgba(0, 0, 0, 0)" });
});

test("a long reply keeps a fixed height and follows the newest words", async ({ page }) => {
  const call = await startCall(page);
  call.agent("Short answer");
  await expect(strip(page)).toContainText("Short");
  const h = (await strip(page).boundingBox())!;
  // The bottom edge of the text sits inside the strip, so the last words are the visible ones.
  const expectEndInView = async (last: ReturnType<Page["locator"]>) => {
    const bottoms = await last.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      const clip = el.closest("[data-tail]")!.getBoundingClientRect();
      return { text: rects[rects.length - 1].bottom, clip: clip.bottom };
    });
    expect(bottoms.text).toBeLessThanOrEqual(bottoms.clip + 1);
  };
  call.agent(` ${LONG_REPLY}`);
  const streaming = strip(page).getByText(/word88/).first();
  await expect(streaming).toBeAttached();
  expect(await strip(page).boundingBox()).toEqual(h);
  await expectEndInView(streaming);
  // The word the live guard held arrives with the end of the turn.
  call.agentDone();
  const last = strip(page).getByText(/word89/).first();
  await expect(last).toBeAttached();
  expect(await strip(page).boundingBox()).toEqual(h);
  await expectEndInView(last);
});

test("a long caller line keeps its newest words in view, on one row", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const call = await startCall(page);
  call.user("What has he built lately, and can you send his links over to me please?", false);
  const text = strip(page).getByText(/send his links/);
  await expect(text).toBeAttached();
  const { end, clip, top, height } = await text.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = el.closest("[data-tail]")!.getBoundingClientRect();
    return { end: r.right, clip: c.right, top: r.top - c.top, height: r.height };
  });
  expect(end).toBeLessThanOrEqual(clip + 1);
  expect([top, height]).toEqual([0, 20]);
});

test("160 in-place edits keep the same element and the same geometry", async ({ page }) => {
  const call = await startCall(page);
  call.user("Live", false);
  const line = strip(page).getByText("Live");
  await expect(line).toBeAttached();
  await line.evaluate((el) => ((window as unknown as { held: Element }).held = el));
  const box = await strip(page).boundingBox();
  for (let i = 0; i < 160; i++) call.user(" w", false);
  await expect(strip(page)).toContainText("w w w");
  await expect.poll(() => line.evaluate((el) => el.textContent!.length)).toBe(4 + 160 * 2);
  expect(await page.evaluate(() => document.contains((window as unknown as { held: Element }).held))).toBe(true);
  expect(await strip(page).boundingBox()).toEqual(box);
  await expect(strip(page).locator("[data-leaving]")).toHaveCount(0);
});

test("hover reveals the fullscreen icon on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const call = await startCall(page);
  await page.mouse.move(0, 0);
  await exchange(page, call);
  await expect(expand(page)).toHaveCSS("opacity", "0");
  await strip(page).hover();
  await expect(expand(page)).toHaveCSS("opacity", "1");
  const icon = (await expand(page).boundingBox())!;
  const s = (await strip(page).boundingBox())!;
  expect(icon.x + icon.width).toBeGreaterThan(s.x + s.width * 0.8);
  // Keyboard users reach it without a mouse.
  await page.mouse.move(0, 0);
  await expect(expand(page)).toHaveCSS("opacity", "0");
  for (let i = 0; i < 10 && !(await expand(page).evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(expand(page)).toBeFocused();
  await expect(expand(page)).toHaveCSS("opacity", "1");
});

test.describe("touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  test("the fullscreen icon is always visible and opens the popup", async ({ page }) => {
    const call = await startCall(page);
    await exchange(page, call);
    await expect(expand(page)).toHaveCSS("opacity", "1");
    await expand(page).tap();
    await expect(popup(page)).toBeVisible();
    const box = (await popup(page).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(375);
  });
});

test.describe("popup", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shows the full conversation and stays live", async ({ page }) => {
    const call = await startCall(page);
    await exchange(page, call);
    await expect(popup(page)).toHaveCount(0);
    await strip(page).hover();
    await expand(page).click();
    const log = popup(page).getByRole("log");
    for (const t of ["Hey, I'm Ariv's AI.", "Where does he work?", "He works at INZI Controls."]) await expect(log).toContainText(t);
    call.user("And before that?");
    await expect(log).toContainText("And before that?");
    call.tool("share_links");
    await expect(log.getByRole("link", { name: /github/i })).toBeVisible();
  });

  test("traps focus, closes on Esc and hands focus back", async ({ page }) => {
    const call = await startCall(page);
    await exchange(page, call);
    await strip(page).hover();
    await expand(page).click();
    await expect(popup(page)).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await popup(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await popup(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(popup(page)).toHaveCount(0);
    await expect(expand(page)).toBeFocused();
  });

  test("close button works, and the log is announced", async ({ page }) => {
    const call = await startCall(page);
    await exchange(page, call);
    await strip(page).hover();
    await expand(page).click();
    const log = popup(page).getByRole("log");
    await expect(log).toHaveAttribute("aria-live", "polite");
    await popup(page).getByRole("button", { name: /close/i }).click();
    await expect(popup(page)).toHaveCount(0);
  });

  test("scroll stays pinned, and yields when the reader scrolls up", async ({ page }) => {
    const call = await startCall(page);
    for (let i = 0; i < 30; i++) {
      call.user(`Question ${i}?`);
      call.agent(`Answer ${i}. ${LONG_REPLY}`);
      call.agentDone();
    }
    await expect(strip(page)).toContainText("Question 29?");
    await strip(page).hover();
    await expand(page).click();
    const log = popup(page).getByRole("log");
    const gap = () => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    await expect.poll(gap).toBeLessThan(2);
    call.agent("Still pinned here. Held");
    await expect(log).toContainText("Still pinned here.");
    await expect.poll(gap).toBeLessThan(2);

    await log.evaluate((el) => el.scrollTo({ top: 200 }));
    await log.dispatchEvent("scroll");
    await page.waitForTimeout(50);
    const top = await log.evaluate((el) => el.scrollTop);
    call.agent(" More words while reading. Held");
    await expect(log).toContainText("More words while reading.");
    expect(await log.evaluate((el) => el.scrollTop)).toBe(top);

    await popup(page).getByRole("button", { name: /latest/i }).click();
    await expect.poll(gap).toBeLessThan(2);
    call.agent(" Pinned again. Held");
    await expect(log).toContainText("Pinned again.");
    await expect.poll(gap).toBeLessThan(2);
  });
});

test.describe("cards", () => {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 375, height: 812 }]] as const) {
    test(`links, booking and recap are reachable during the call on ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const call = await startCall(page);
      await exchange(page, call);
      call.tool("share_links");
      call.tool("schedule_meeting");
      call.tool("generate_summary");
      const booking = page.getByRole("link", { name: /confirm on calendly/i });
      await expect(booking).toBeVisible();
      await expect(booking).toHaveAttribute("href", BOOKING_CARD.url);
      await expect(booking).toContainText("Tue Nov 3");
      // The booking is never pushed out of sight by other cards.
      const b = (await booking.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
      const [popupPage] = await Promise.all([page.waitForEvent("popup"), booking.click()]);
      await popupPage.close();

      const gh = page.getByRole("link", { name: "GitHub" });
      await expect(gh).toHaveAttribute("href", "https://github.com/x");
      await gh.scrollIntoViewIfNeeded();
      await expect(gh).toBeVisible();

      await page.getByRole("button", { name: /recap/i }).click();
      await expect(popup(page)).toContainText("Works at INZI Controls");
    });
  }
});

test.describe("after the call", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("post-call panel, share, print and booking still work", async ({ page }) => {
    const call = await startCall(page);
    await exchange(page, call);
    call.tool("share_links");
    await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => void (window as unknown as { printed: number }).printed++;
    });
    await page.getByRole("button", { name: /^end$/i }).click();
    await expect(page.getByText("Your transcript")).toBeVisible();
    await expect(page.getByRole("button", { name: /create share link/i })).toBeInViewport();
    await page.getByRole("button", { name: /create share link/i }).click();
    await expect(page.getByRole("button", { name: /copy share link/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /book time/i })).toBeVisible();
    await page.getByRole("button", { name: /print or save/i }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    // The whole conversation is still one click away, and is what gets printed.
    await page.emulateMedia({ media: "print" });
    const print = page.locator('[data-print="transcript"]');
    await expect(print).toBeVisible();
    for (const t of ["Hey, I'm Ariv's AI.", "Where does he work?", "He works at INZI Controls.", "GitHub"]) await expect(print).toContainText(t);
    expect(await print.evaluate((el) => getComputedStyle(el).visibility)).toBe("visible");
    expect(await orb(page).evaluate((el) => getComputedStyle(el).visibility)).toBe("hidden");
    await page.emulateMedia({ media: "screen" });
    await expand(page).focus();
    await page.keyboard.press("Enter");
    await expect(popup(page).getByRole("log")).toContainText("Where does he work?");
  });
});

test("reduced motion: no animation on the strip", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const call = await startCall(page);
  await exchange(page, call);
  call.user("Next?");
  await expect(strip(page)).toContainText("Next?");
  expect(await strip(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(strip(page).locator("[data-leaving]")).toHaveCount(0);
});

test.describe("axe", () => {
  const serious = async (page: Page) => {
    // Fades pass through low contrast for 180 ms. Axe has to judge the colours people read.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target} ${JSON.stringify(n.any[0]?.data ?? {})}`).join(" | ")}`);
  };
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 375, height: 812 }]] as const) {
    test(`no serious violations in a call and in the popup on ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const call = await startCall(page);
      await exchange(page, call);
      call.tool("share_links");
      call.tool("schedule_meeting");
      await expect(page.getByRole("link", { name: /confirm on calendly/i })).toBeVisible();
      await expect(strip(page).locator("[data-leaving]")).toHaveCount(0);
      expect(await serious(page)).toEqual([]);
      await expand(page).focus();
      await page.keyboard.press("Enter");
      await expect(popup(page)).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });
  }
});
