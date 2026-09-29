import { createHash } from "crypto";
import { safeRedis } from "./rate-limit";

/**
 * What a request says about the visitor, for Ariv's analytics: rough location
 * (Vercel's edge headers, no lookup), device, and whether it's a bot. Raw IP
 * addresses are never stored; the network owner (e.g. "Microsoft Corporation")
 * is looked up once per IP and cached under a hash.
 */
export type Device = "mobile" | "tablet" | "desktop";
export type RequestContext = {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  device: Device | null;
  browser: string | null;
  os: string | null;
  bot: boolean;
};
export type Network = { org: string | null; domain: string | null; asn: string | null; host: string | null; kind: "isp" | "hosting" | "org" };

const header = (req: Request, name: string, max = 80): string | null => {
  const v = req.headers.get(name);
  if (!v) return null;
  try {
    return decodeURIComponent(v).slice(0, max);
  } catch {
    return v.slice(0, max);
  }
};

// Crawlers, link unfurlers, scripts and headless browsers (including our own E2E runs).
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|headless|phantom|puppeteer|playwright|lighthouse|facebookexternalhit|embedly|curl\/|wget\/|python-requests|python-urllib|axios\/|node-fetch|undici|^node$|go-http-client|okhttp/i;

export function parseUserAgent(ua: string): Pick<RequestContext, "device" | "browser" | "os" | "bot"> {
  if (!ua) return { device: null, browser: null, os: null, bot: true };
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /CrOS/.test(ua)
        ? "ChromeOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /CriOS|Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const device: Device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /Mobi|iPhone|iPod/.test(ua) ? "mobile" : "desktop";
  return { device, browser, os, bot: BOT_UA.test(ua) };
}

export function requestContext(req: Request): RequestContext {
  return {
    country: header(req, "x-vercel-ip-country", 2),
    region: header(req, "x-vercel-ip-country-region", 8),
    city: header(req, "x-vercel-ip-city"),
    timezone: header(req, "x-vercel-ip-timezone", 60),
    ...parseUserAgent(req.headers.get("user-agent") || ""),
  };
}

// Consumer ISPs and mobile carriers: the network says nothing about the visitor's employer.
// Small regional ISPs rarely have famous names, so generic ISP words count too (F-04).
const ISP =
  /cable|broadband|telecom|telephone|wireless|cellular|fiber|fibre|\bdsl\b|satellite|internet service|comcast|charter|spectrum|at&t|\bat ?& ?t\b|verizon|cellco|t-mobile|tmobile|sprint|cox comm|frontier|centurylink|lumen|windstream|altice|optimum|mediacom|suddenlink|\brcn\b|wideopenwest|google fiber|starlink|space exploration|us cellular|brightspeed|ziply|astound|bell canada|rogers|telus|shaw|vodafone|british telecom|\bbt\b|virgin media|sky uk|reliance jio|jio|bharti|airtel|bsnl|act fibernet|hathway|claro|telmex|movistar|telefonica|orange|deutsche telekom|telstra|optus|singtel|kddi|softbank|ntt|korea telecom|sk broadband|lg (uplus|powercomm)|chinanet|china (telecom|unicom|mobile)/i;
// Clouds, proxies and VPNs: likely not where the person works (Zscaler & co. front many companies).
const HOSTING =
  /digitalocean|linode|akamai|cloudflare|ovh|hetzner|vultr|choopa|contabo|leaseweb|m247|datacamp|packethub|zscaler|netskope|palo alto|forcepoint|nordvpn|expressvpn|mullvad|proton ?(ag|vpn)|private internet access|hostinger|scaleway|oracle cloud|alibaba|tencent/i;

export function networkKind(org: string | null): Network["kind"] {
  if (!org) return "isp";
  if (ISP.test(org)) return "isp";
  if (HOSTING.test(org)) return "hosting";
  return "org";
}

const PRIVATE_IP = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd|fe80:|unknown$)/i;

/**
 * Who owns the visitor's network (IPinfo). With IPINFO_TOKEN it uses IPinfo
 * Lite (free, unlimited); without one, IPinfo's keyless endpoint (rate
 * limited). Best effort: 1.5 s timeout, never throws, cached for a week.
 */
export async function lookupNetwork(ip: string | null): Promise<Network | null> {
  if (!ip || PRIVATE_IP.test(ip) || ip.length > 64) return null;
  const key = `net:v1:${createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}|${ip}`).digest("hex").slice(0, 32)}`;
  const cached = await safeRedis((r) => r.get<Network>(key), null);
  if (cached) return cached;
  const token = process.env.IPINFO_TOKEN;
  let net: Network | null = null;
  try {
    if (token) {
      const r = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) {
        const d = (await r.json()) as { as_name?: string; as_domain?: string; asn?: string };
        const org = d.as_name?.slice(0, 120) ?? null;
        net = { org, domain: d.as_domain?.slice(0, 120) ?? null, asn: d.asn?.slice(0, 20) ?? null, host: null, kind: networkKind(org) };
      }
    } else {
      const r = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        const d = (await r.json()) as { org?: string; hostname?: string; bogon?: boolean };
        const m = /^(AS\d+)\s+(.+)$/.exec(d.org ?? "");
        const org = (m ? m[2] : d.org)?.slice(0, 120) ?? null;
        if (!d.bogon) net = { org, domain: null, asn: m?.[1] ?? null, host: d.hostname?.slice(0, 160) ?? null, kind: networkKind(org) };
      }
    }
  } catch {
    net = null;
  }
  if (net) await safeRedis((r) => r.set(key, net, { ex: 7 * 86400 }), null);
  return net;
}

/** The caller's IP as Vercel reports it (used only for the network lookup, never stored). */
export function rawIp(req: Request): string | null {
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
