/** Client-side error reporter: POSTs to /api/client-error, capped per page load. */
const MAX_REPORTS = 5;
const MIN_GAP_MS = 2000;
let sent = 0;
let last = 0;
const seen = new Set<string>();

export function reportError(err: unknown, context?: string): void {
  if (typeof window === "undefined" || sent >= MAX_REPORTS) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const key = `${e.name}:${e.message}`;
  const now = Date.now();
  if (seen.has(key) || now - last < MIN_GAP_MS) return;
  seen.add(key);
  sent++;
  last = now;
  const body = JSON.stringify({
    message: e.message.slice(0, 500),
    stack: (e.stack || "").slice(0, 2000),
    context: context?.slice(0, 100),
    path: location.pathname,
  });
  try {
    if (navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/client-error", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}

/** Test helper. */
export function _resetReporter() {
  sent = 0;
  last = 0;
  seen.clear();
}
