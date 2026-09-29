import type { Booking } from "./calendly";

/**
 * Turns raw site events, saved calls and Calendly bookings into Ariv's
 * dashboard: one card per visitor (where they're from, how they found the
 * site, what they asked, what they clicked, who they said they are), plus
 * totals. Pure function, so it's unit-tested without a database.
 */
export type CallContext = {
  country?: string | null;
  region?: string | null;
  city?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  network?: { org: string | null; domain: string | null; host: string | null; kind: string | null } | null;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  signedIn?: boolean;
};

export type CallRow = {
  id: string;
  session_id: string;
  created_at: string;
  caller_name: string | null;
  caller_email: string | null;
  intent: string | null;
  summary: string | null;
  topics: string[] | null;
  outcome: string | null;
  company: string | null;
  share_token: string | null;
  visitor_id?: string | null;
  caller_role?: string | null;
  hiring_for?: string | null;
  questions?: string[] | null;
  duration_s?: number | null;
  context?: CallContext | null;
  is_owner?: boolean | null;
  is_bot?: boolean | null;
};

export type EventRow = {
  created_at: string;
  type: string;
  visitor_id: string | null;
  session_id: string | null;
  label: string | null;
  referrer: string | null;
  utm: Record<string, string> | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  network_org: string | null;
  network_domain: string | null;
  network_host: string | null;
  network_kind: string | null;
  is_owner: boolean | null;
  is_bot: boolean | null;
};

export type VisitorCard = {
  id: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
  location: string | null;
  network: { org: string | null; domain: string | null; host: string | null; kind: string | null } | null;
  source: string | null;
  device: string | null;
  identity: { name: string | null; role: string | null; company: string | null; email: string | null; via: string[] } | null;
  clicks: string[];
  calls: { at: string; durationS: number | null; summary: string | null; intent: string | null; outcome: string | null; questions: string[]; hiringFor: string | null; shareToken: string | null }[];
  booking: { name: string; email: string; startTime: string; status: string } | null;
  owner: boolean;
  bot: boolean;
};

type Count = { name: string; count: number };

export type Report = {
  range: { days: number; since: string };
  overview: { visitors: number; visits: number; calls: number; avgCallSeconds: number | null; identified: number; bookingClicks: number; bookings: number; returning: number };
  daily: { date: string; visits: number; calls: number }[];
  visitors: VisitorCard[];
  recentQuestions: { text: string; at: string; where: string | null; who: string | null }[];
  topTopics: Count[];
  intents: Count[];
  outcomes: Count[];
  sources: Count[];
  locations: Count[];
  networks: (Count & { kind: string | null })[];
  devices: Count[];
  bookings: (Booking & { matched: boolean })[];
  meta: { excludedOwner: number; excludedBots: number; includeAll: boolean };
};

const place = (city?: string | null, region?: string | null, country?: string | null) => [city, region, country].filter(Boolean).join(", ") || null;
const sourceOf = (referrer?: string | null, utm?: Record<string, string> | null) =>
  referrer?.split("/")[0] || (utm?.source ? `${utm.source}${utm.campaign ? ` / ${utm.campaign}` : ""}` : null);
const deviceOf = (d?: string | null, b?: string | null, o?: string | null) => [d, b, o].filter(Boolean).join(" · ") || null;
const isBooking = (label: string | null) => !!label && /book|calendly|confirm/i.test(label);

function tally(values: (string | null | undefined)[], top = 10): Count[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, count]) => ({ name, count }));
}

export function buildReport(input: {
  calls: CallRow[];
  events: EventRow[];
  bookings: Booking[] | null;
  days: number;
  includeAll: boolean;
  now?: Date;
}): Report {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.days * 86400_000);
  const keep = (r: { is_owner?: boolean | null; is_bot?: boolean | null }) => input.includeAll || (!r.is_owner && !r.is_bot);
  const excludedOwner = input.events.filter((e) => e.is_owner).length + input.calls.filter((c) => c.is_owner).length;
  const excludedBots = input.events.filter((e) => e.is_bot && !e.is_owner).length + input.calls.filter((c) => c.is_bot && !c.is_owner).length;
  const events = input.events.filter(keep);
  const calls = input.calls.filter(keep);

  const cards = new Map<string, VisitorCard>();
  const card = (id: string, at: string): VisitorCard => {
    let c = cards.get(id);
    if (!c) {
      c = { id, firstSeen: at, lastSeen: at, visits: 0, location: null, network: null, source: null, device: null, identity: null, clicks: [], calls: [], booking: null, owner: false, bot: false };
      cards.set(id, c);
    }
    if (at < c.firstSeen) c.firstSeen = at;
    if (at > c.lastSeen) c.lastSeen = at;
    return c;
  };
  const sessionToCard = new Map<string, string>();

  // Oldest first, so first-touch source wins and the latest location/network overwrite.
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const id = e.visitor_id ?? (e.session_id ? `call:${e.session_id}` : null);
    if (!id) continue;
    const c = card(id, e.created_at);
    if (e.session_id) sessionToCard.set(e.session_id, id);
    c.owner ||= !!e.is_owner;
    c.bot ||= !!e.is_bot;
    if (e.type === "visit") {
      c.visits++;
      c.source ??= sourceOf(e.referrer, e.utm);
    }
    c.location = place(e.city, e.region, e.country) ?? c.location;
    if (e.network_org || e.network_host) c.network = { org: e.network_org, domain: e.network_domain, host: e.network_host, kind: e.network_kind };
    c.device = deviceOf(e.device, e.browser, e.os) ?? c.device;
    if (e.type === "click" && e.label && !c.clicks.includes(e.label)) c.clicks.push(e.label);
  }

  const identify = (c: VisitorCard, patch: Partial<NonNullable<VisitorCard["identity"]>>, via: string) => {
    const cur = c.identity ?? { name: null, role: null, company: null, email: null, via: [] };
    c.identity = {
      name: cur.name ?? patch.name ?? null,
      role: cur.role ?? patch.role ?? null,
      company: cur.company ?? patch.company ?? null,
      email: cur.email ?? patch.email ?? null,
      via: cur.via.includes(via) ? cur.via : [...cur.via, via],
    };
  };

  for (const call of calls) {
    const id = call.visitor_id ?? sessionToCard.get(call.session_id) ?? `call:${call.session_id}`;
    const c = card(id, call.created_at);
    sessionToCard.set(call.session_id, id);
    c.owner ||= !!call.is_owner;
    c.bot ||= !!call.is_bot;
    const ctx = call.context ?? {};
    c.location ??= place(ctx.city, ctx.region, ctx.country);
    c.network ??= ctx.network ?? null;
    c.source ??= sourceOf(ctx.referrer, ctx.utm);
    c.device ??= deviceOf(ctx.device, ctx.browser, ctx.os);
    c.calls.push({
      at: call.created_at,
      durationS: call.duration_s ?? null,
      summary: call.summary,
      intent: call.intent,
      outcome: call.outcome,
      questions: call.questions ?? [],
      hiringFor: call.hiring_for ?? null,
      shareToken: call.share_token,
    });
    if (call.caller_name || call.caller_role || call.company) identify(c, { name: call.caller_name, role: call.caller_role ?? null, company: call.company }, "said on the call");
    if (call.caller_email) identify(c, { email: call.caller_email }, "signed in");
  }

  const bookings = (input.bookings ?? []).map((b) => {
    const id = b.ref?.startsWith("s_") ? sessionToCard.get(b.ref) : b.ref?.startsWith("v_") && cards.has(b.ref) ? b.ref : undefined;
    const c = id ? cards.get(id) : undefined;
    if (c) {
      c.booking ??= { name: b.name, email: b.email, startTime: b.startTime, status: b.status };
      identify(c, { name: b.name, email: b.email }, "booked on Calendly");
    }
    return { ...b, matched: !!c };
  });

  const list = [...cards.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  for (const c of list) c.calls.sort((a, b) => b.at.localeCompare(a.at));

  const days: { date: string; visits: number; calls: number }[] = [];
  for (let d = 0; d < input.days; d++) {
    days.push({ date: new Date(since.getTime() + (d + 1) * 86400_000).toISOString().slice(0, 10), visits: 0, calls: 0 });
  }
  const dayIdx = new Map(days.map((d, i) => [d.date, i]));
  for (const e of events) if (e.type === "visit") { const i = dayIdx.get(e.created_at.slice(0, 10)); if (i !== undefined) days[i].visits++; }
  for (const c of calls) { const i = dayIdx.get(c.created_at.slice(0, 10)); if (i !== undefined) days[i].calls++; }

  const durations = calls.map((c) => c.duration_s).filter((d): d is number => typeof d === "number" && d > 0);
  const recentQuestions = calls
    .flatMap((c) => {
      const who = [c.caller_name, c.caller_role, c.company].filter(Boolean).join(", ") || null;
      const where = place(c.context?.city, c.context?.region, c.context?.country);
      return (c.questions ?? []).map((text) => ({ text, at: c.created_at, where, who }));
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);

  const visitEvents = events.filter((e) => e.type === "visit");
  const networks = new Map<string, { count: number; kind: string | null }>();
  for (const c of list) {
    const n = c.network?.org;
    if (!n) continue;
    const cur = networks.get(n) ?? { count: 0, kind: c.network?.kind ?? null };
    cur.count++;
    networks.set(n, cur);
  }

  return {
    range: { days: input.days, since: since.toISOString() },
    overview: {
      visitors: list.length,
      visits: visitEvents.length,
      calls: calls.length,
      avgCallSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      identified: list.filter((c) => c.identity).length,
      bookingClicks: events.filter((e) => e.type === "click" && isBooking(e.label)).length,
      bookings: bookings.filter((b) => b.status === "active").length,
      returning: list.filter((c) => c.visits > 1).length,
    },
    daily: days,
    visitors: list.slice(0, 100),
    recentQuestions,
    topTopics: tally(calls.flatMap((c) => c.topics ?? []), 12),
    intents: tally(calls.map((c) => c.intent ?? "unknown")),
    outcomes: tally(calls.map((c) => c.outcome ?? "unknown")),
    sources: tally(list.map((c) => c.source ?? "direct / unknown")),
    locations: tally(list.map((c) => c.location)),
    networks: [...networks].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([name, v]) => ({ name, count: v.count, kind: v.kind })),
    devices: tally(list.map((c) => c.device)),
    bookings,
    meta: { excludedOwner, excludedBots, includeAll: input.includeAll },
  };
}
