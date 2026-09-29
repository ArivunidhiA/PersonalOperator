import { after } from "next/server";

/**
 * Run bookkeeping after the response is sent (Vercel keeps the function alive
 * for it), so analytics never slows a call down. Outside a request (unit
 * tests), it just runs now.
 */
export function later(fn: () => Promise<unknown>): void {
  const run = () => fn().catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
}
