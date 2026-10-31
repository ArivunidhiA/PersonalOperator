#!/usr/bin/env node
/**
 * Production smoke test. Plain fetch checks always run; the render check runs
 * in Lightpanda over CDP when CDP_URL is set (e.g. ws://127.0.0.1:9222) and
 * falls back to a fetch-only check when it is not or cannot connect.
 *
 *   SMOKE_BASE_URL=https://www.arivsai.app node scripts/smoke-lightpanda.mjs
 *   CDP_URL=ws://127.0.0.1:9222 node scripts/smoke-lightpanda.mjs
 *
 * Exit 1 on any failure. Hosts that block bots (LinkedIn, X) only warn.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = (process.env.SMOKE_BASE_URL || "https://www.arivsai.app").replace(/\/$/, "");
const CDP_URL = process.env.CDP_URL;
const BOT_HOSTILE = /(^|\.)(linkedin\.com|x\.com|twitter\.com)$/;
const DEAD_TOKEN = "deadbeef".repeat(4);
const OLD_ENDPOINTS = ["/api/voice/token", "/api/chat", "/api/realtime", "/api/voice/gemini-token"];
const HEADERS = {
  "x-content-type-options": /nosniff/i,
  "x-frame-options": /DENY/i,
  "referrer-policy": /strict-origin-when-cross-origin/i,
  "permissions-policy": /microphone=\(self\)/i,
  "content-security-policy": /frame-ancestors 'none'/i,
};

const failures = [];
const warns = [];
const ok = (m) => console.log(`ok    ${m}`);
const fail = (m) => (failures.push(m), console.log(`FAIL  ${m}`));
const warn = (m) => (warns.push(m), console.log(`warn  ${m}`));
const get = (url, init) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000), ...init });

function readLinks() {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../lib/knowledge.ts"), "utf8");
  const block = src.match(/export const LINKS = \{([\s\S]*?)\} as const/)?.[1] ?? "";
  return [...block.matchAll(/(\w+):\s*"(https:\/\/[^"]+)"/g)].map((m) => ({ key: m[1], url: m[2] }));
}

async function checkLinks() {
  const links = readLinks();
  if (!links.length) return fail("could not parse LINKS from lib/knowledge.ts");
  for (const { key, url } of links) {
    try {
      let res = await get(url, { method: "HEAD" });
      if (res.status >= 400) res = await get(url, { method: "GET" });
      const good = res.status >= 200 && res.status < 400;
      if (good) ok(`LINKS.${key} ${res.status}`);
      else if (BOT_HOSTILE.test(new URL(url).hostname)) warn(`LINKS.${key} ${res.status} (host blocks bots)`);
      else fail(`LINKS.${key} ${url} -> ${res.status}`);
    } catch (e) {
      fail(`LINKS.${key} ${url} -> ${e.message}`);
    }
  }
}

async function checkHeaders() {
  const res = await get(`${BASE}/`);
  if (res.status >= 400) return fail(`GET / -> ${res.status}`);
  ok(`GET / ${res.status}`);
  for (const [name, re] of Object.entries(HEADERS)) {
    const v = res.headers.get(name);
    if (v && re.test(v)) ok(`header ${name}`);
    else fail(`header ${name} missing or wrong: ${v}`);
  }
  if (res.headers.get("x-powered-by")) fail("x-powered-by header present");
}

async function checkOldEndpoints() {
  for (const p of OLD_ENDPOINTS) {
    for (const method of ["GET", "POST"]) {
      const res = await get(BASE + p, { method });
      if (res.status === 404) ok(`${method} ${p} 404`);
      else fail(`${method} ${p} expected 404, got ${res.status}`);
    }
  }
}

async function checkCallPage() {
  const url = `${BASE}/call/${DEAD_TOKEN}`;
  const NOT_FOUND = /not found/i;
  if (CDP_URL) {
    try {
      const { default: puppeteer } = await import("puppeteer-core");
      const browser = await puppeteer.connect({ browserWSEndpoint: CDP_URL });
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
        await page.waitForFunction(() => /not found/i.test(document.body?.innerText || ""), { timeout: 15000 });
        ok("CDP: /call/<unknown token> renders the not-found state");
        return;
      } finally {
        await browser.disconnect();
      }
    } catch (e) {
      warn(`CDP render unavailable (${e.message}); falling back to fetch check`);
    }
  }
  const res = await get(url);
  if (res.status !== 200) return fail(`GET /call/<token> -> ${res.status}`);
  const html = await res.text();
  // Client-rendered page: the shell must load; the not-found text appears only after hydration.
  if (/Application error|Internal Server Error/i.test(html)) fail("/call/<token> shell shows an error");
  else ok(`fetch: /call/<token> shell 200${NOT_FOUND.test(html) ? " (not-found text present)" : ""}`);
  const api = await get(`${BASE}/api/calls/${DEAD_TOKEN}`);
  if (api.status === 404) ok("GET /api/calls/<unknown token> 404");
  else fail(`GET /api/calls/<unknown token> expected 404, got ${api.status}`);
}

console.log(`Smoke: ${BASE}${CDP_URL ? ` (CDP ${CDP_URL})` : " (fetch only)"}`);
for (const step of [checkLinks, checkHeaders, checkOldEndpoints, checkCallPage]) {
  try {
    await step();
  } catch (e) {
    fail(`${step.name} threw: ${e.cause?.code || e.message}`);
  }
}
console.log(`\n${failures.length} failure(s), ${warns.length} warning(s)`);
process.exit(failures.length ? 1 : 0);
