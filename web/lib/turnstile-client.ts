/** Browser side of Turnstile: invisible/managed widget, token fetched on call start. No-op without a site key. */
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TS = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

function loadScript(): Promise<TS | null> {
  const w = window as unknown as { turnstile?: TS };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(w.turnstile ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

export async function turnstileToken(): Promise<string | undefined> {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey || typeof document === "undefined") return undefined;
  const ts = await loadScript();
  if (!ts) return undefined;
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:50";
  document.body.appendChild(el);
  return new Promise((resolve) => {
    let id = "";
    const done = (t?: string) => {
      clearTimeout(timer);
      try {
        ts.remove(id);
      } catch {
        /* already gone */
      }
      el.remove();
      resolve(t);
    };
    const timer = setTimeout(() => done(undefined), 15000);
    id = ts.render(el, {
      sitekey: siteKey,
      appearance: "interaction-only",
      callback: (t: string) => done(t),
      "error-callback": () => done(undefined),
    });
  });
}
