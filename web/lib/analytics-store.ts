import { getSupabase } from "./supabase";
import { createLogger } from "./logger";
import type { Network, RequestContext } from "./visitor";

const log = createLogger({ tool: "analytics-store" });

/** One row in site_events (scripts/migrate-v4.sql). */
export type SiteEvent = {
  type: "visit" | "click" | "call_start";
  visitor_id?: string | null;
  session_id?: string | null;
  label?: string | null;
  target?: string | null;
  path?: string | null;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  language?: string | null;
  is_owner?: boolean;
} & Partial<Pick<RequestContext, "country" | "region" | "city" | "timezone" | "device" | "browser" | "os">> & {
    is_bot?: boolean;
    network_org?: string | null;
    network_domain?: string | null;
    network_asn?: string | null;
    network_host?: string | null;
    network_kind?: Network["kind"] | null;
  };

let warned = false;

/** Best effort: analytics must never break a call. Logs once if the table is missing. */
export async function recordEvent(e: SiteEvent): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("site_events").insert(e);
  if (error && !warned) {
    warned = true;
    log.warn("site_events insert failed (run scripts/migrate-v4.sql?)", { error: error.message.slice(0, 200) });
  }
}

export function networkFields(net: Network | null) {
  return net
    ? { network_org: net.org, network_domain: net.domain, network_asn: net.asn, network_host: net.host, network_kind: net.kind }
    : {};
}

const OWNER_IDS = () => (process.env.ANALYTICS_OWNER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** Ariv's own Clerk account(s), so his test calls and visits can be filtered out. */
export function isOwnerUser(userId: string | null | undefined): boolean {
  return !!userId && OWNER_IDS().includes(userId);
}

export type VisitorHistory = {
  visits: number;
  firstSeen: string | null;
  referrer: string | null;
  utm: Record<string, string> | null;
  network: { org: string | null; domain: string | null; host: string | null; kind: string | null } | null;
  clicks: string[];
};

/** What we know about a caller's visits and clicks (for the call record and Ariv's email). */
export async function visitorHistory(vid: string | null | undefined, sid: string): Promise<VisitorHistory | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const cols = "type, label, created_at, referrer, utm, network_org, network_domain, network_host, network_kind, session_id";
  const [byVisitor, bySession] = await Promise.all([
    vid
      ? supabase.from("site_events").select(cols).eq("visitor_id", vid).order("created_at", { ascending: true }).limit(300)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    supabase.from("site_events").select(cols).eq("session_id", sid).eq("type", "click").limit(50),
  ]);
  if (byVisitor.error || bySession.error) return null;
  type Row = { type: string; label: string | null; created_at: string; referrer: string | null; utm: Record<string, string> | null; network_org: string | null; network_domain: string | null; network_host: string | null; network_kind: string | null };
  const rows = (byVisitor.data ?? []) as Row[];
  const visits = rows.filter((r) => r.type === "visit");
  const first = visits[0];
  const withNet = [...visits].reverse().find((r) => r.network_org || r.network_host);
  const clicks = [...new Set([...rows.filter((r) => r.type === "click"), ...((bySession.data ?? []) as Row[])].map((r) => r.label).filter((l): l is string => !!l))];
  return {
    visits: visits.length,
    firstSeen: first?.created_at ?? null,
    referrer: visits.find((r) => r.referrer)?.referrer ?? null,
    utm: visits.find((r) => r.utm)?.utm ?? null,
    network: withNet ? { org: withNet.network_org, domain: withNet.network_domain, host: withNet.network_host, kind: withNet.network_kind } : null,
    clicks,
  };
}
