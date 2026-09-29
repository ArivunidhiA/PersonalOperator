/**
 * Browser side of the site analytics (see app/api/track). No cookies: a random
 * visitor id lives in localStorage, and only after the server says this
 * visitor's region allows it (EEA/UK/CH stay anonymous). Browsers that send
 * Global Privacy Control or Do Not Track are never tracked.
 */
const VID_KEY = "ariv-vid";
const OWNER_KEY = "ariv-owner";
let memoryVid: string | null = null;
let noPersist = false;

type Nav = Navigator & { globalPrivacyControl?: boolean };

export function optedOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const n = navigator as Nav;
  return n.globalPrivacyControl === true || n.doNotTrack === "1";
}

const store = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
  del(k: string) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  },
};

function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `v_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The stored visitor id, or a per-page one that isn't stored yet. */
export function visitorId(): string | null {
  if (optedOut() || noPersist) return null;
  return store.get(VID_KEY) ?? (memoryVid ??= newId());
}

export function isOwnerBrowser(): boolean {
  return store.get(OWNER_KEY) === "1";
}

/** Set when Ariv opens his dashboard, so his own visits and test calls are filtered out. */
export function markOwnerBrowser() {
  store.set(OWNER_KEY, "1");
}

/** Hints for /api/voice/session: which visitor is calling. */
export function sessionHints(): { vid?: string; own?: boolean } {
  if (optedOut()) return {};
  const vid = visitorId();
  return { ...(vid ? { vid } : {}), ...(isOwnerBrowser() ? { own: true } : {}) };
}

export async function trackVisit(path: string) {
  if (optedOut()) return;
  const params = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(
    ["source", "medium", "campaign", "content", "term"].map((k) => [k, params.get(`utm_${k}`) ?? ""]).filter(([, v]) => v),
  );
  const body = {
    t: "visit",
    vid: visitorId(),
    path,
    ref: document.referrer || undefined,
    utm,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang: navigator.language,
    own: isOwnerBrowser() || undefined,
  };
  try {
    const res = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    const data = (await res.json().catch(() => ({}))) as { persist?: boolean };
    if (data.persist === false) {
      noPersist = true;
      store.del(VID_KEY);
    } else if (data.persist && body.vid && !store.get(VID_KEY)) {
      store.set(VID_KEY, body.vid);
    }
  } catch {
    /* analytics never gets in the way */
  }
}

/** A click on a link we show (profile links, booking links). Survives the page navigating away. */
export function trackClick(label: string, href: string, sid?: string | null) {
  if (optedOut()) return;
  const body = JSON.stringify({ t: "click", vid: visitorId(), sid: sid ?? undefined, label, href, path: window.location.pathname, own: isOwnerBrowser() || undefined });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* fall through */
  }
  void fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}
