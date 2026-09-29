import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import { later } from "@/lib/later";
import { isOwnerUser, networkFields, recordEvent, type SiteEvent } from "@/lib/analytics-store";
import { lookupNetwork, rawIp, requestContext } from "@/lib/visitor";
import { strictPrivacyRegion } from "@/lib/voice-config";

export const runtime = "nodejs";

const VID = /^v_[A-Za-z0-9_-]{12,40}$/;
const SID = /^s_[a-z0-9]{4,16}_[A-Za-z0-9_-]{8,24}$/;
const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;

const clean = (v: unknown, max: number): string | null =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) || null : null;

/** Referrer without its query string (it can carry personal data); drops our own pages. */
function cleanReferrer(v: unknown, selfHost: string | null): string | null {
  const s = clean(v, 500);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || (selfHost && u.host === selfHost)) return null;
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 200);
  } catch {
    return null;
  }
}

function targetOf(v: unknown): string | null {
  const s = clean(v, 500);
  if (!s) return null;
  if (s.startsWith("mailto:")) return "email";
  try {
    return new URL(s).host.slice(0, 100) || null;
  } catch {
    return null;
  }
}

/**
 * First-party analytics: page visits and link clicks, so Ariv can see who's
 * using the site, from where, and what they click. The browser sends only
 * page-level facts; location comes from Vercel's edge, and the network owner
 * from a lookup that runs after the response. EEA/UK/CH visits stay anonymous
 * (no visitor id, no location detail, no lookup), and browsers that send
 * Global Privacy Control or Do Not Track never call this at all.
 */
export async function POST(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 4096) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let b: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    b = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const type = b.t === "visit" ? "visit" : b.t === "click" ? "click" : null;
  if (!type) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  if (!(await checkLimit("track", clientIp(req))).ok) return NextResponse.json({ ok: false }, { status: 429 });

  const ctx = requestContext(req);
  const strict = strictPrivacyRegion(ctx.country);
  const utmIn = b.utm && typeof b.utm === "object" ? (b.utm as Record<string, unknown>) : {};
  const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, clean(utmIn[k], 100)]).filter(([, v]) => v)) as Record<string, string>;
  let owner = b.own === true;
  if (!owner && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    try {
      owner = isOwnerUser((await auth()).userId);
    } catch {
      /* anonymous visitor */
    }
  }
  const path = clean(b.path, 200);
  const event: SiteEvent = {
    type,
    visitor_id: !strict && typeof b.vid === "string" && VID.test(b.vid) ? b.vid : null,
    session_id: typeof b.sid === "string" && SID.test(b.sid) ? b.sid : null,
    label: type === "click" ? clean(b.label, 60) : null,
    target: type === "click" ? targetOf(b.href) : null,
    path: path?.startsWith("/") ? path : null,
    referrer: type === "visit" ? cleanReferrer(b.ref, req.headers.get("host")) : null,
    utm: Object.keys(utm).length ? utm : null,
    language: clean(b.lang, 20),
    country: ctx.country,
    region: strict ? null : ctx.region,
    city: strict ? null : ctx.city,
    timezone: strict ? null : (clean(b.tz, 60) ?? ctx.timezone),
    device: ctx.device,
    browser: ctx.browser,
    os: ctx.os,
    is_owner: owner,
    is_bot: ctx.bot,
  };
  const ip = rawIp(req);
  later(async () => {
    const net = type === "visit" && !strict && !ctx.bot ? await lookupNetwork(ip) : null;
    await recordEvent({ ...event, ...networkFields(net) });
  });
  return NextResponse.json({ ok: true, persist: !strict });
}
