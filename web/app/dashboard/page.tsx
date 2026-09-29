"use client";

import { useEffect, useState } from "react";
import { AuthHeader } from "@/app/components/AuthHeader";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Report, VisitorCard } from "@/lib/analytics-report";
import { markOwnerBrowser } from "@/lib/track-client";

type Data = Report & { meta: Report["meta"] & { migrationPending?: boolean; bookingsAvailable?: boolean } };

const TOOLTIP = { background: "#111", border: "1px solid #333", borderRadius: "8px", color: "#fff" };

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dur = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const pretty = (v: string | null) => (v ?? "unknown").replace(/_/g, " ");

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-white/35">{sub}</div>}
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-white/10 bg-white/5 p-5 ${className}`}>
      <h2 className="text-xs font-medium uppercase tracking-wider text-white/40">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CountList({ rows, empty }: { rows: { name: string; count: number; kind?: string | null }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-white/30">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center justify-between gap-3">
          <span className="truncate text-white/75">
            {r.name}
            {r.kind && r.kind !== "org" && <span className="ml-2 text-[11px] text-white/35">{r.kind === "isp" ? "ISP" : "cloud/VPN"}</span>}
          </span>
          <span className="font-semibold text-white">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function NetworkLine({ n }: { n: VisitorCard["network"] }) {
  if (!n?.org && !n?.host) return null;
  const tag = n.kind === "isp" ? "home/mobile ISP" : n.kind === "hosting" ? "cloud/VPN" : "possibly their company";
  return (
    <span>
      <span className={n.kind === "org" ? "text-emerald-300/90" : "text-white/60"}>{n.org ?? n.host}</span>
      {n.domain && <span className="text-white/40"> ({n.domain})</span>}
      <span className="text-white/30"> · {tag}</span>
    </span>
  );
}

function VisitorItem({ v }: { v: VisitorCard }) {
  const [open, setOpen] = useState(false);
  const who = v.identity ? [v.identity.name, v.identity.role, v.identity.company].filter(Boolean).join(", ") || v.identity.email : null;
  return (
    <li className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-white">
          {who ?? <span className="text-white/60">Anonymous visitor</span>}
          {v.identity?.email && who !== v.identity.email && <span className="ml-2 text-xs text-white/45">{v.identity.email}</span>}
          {v.identity && <span className="ml-2 text-[11px] text-white/30">({v.identity.via.join(", ")})</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {v.booking && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">booked {when(v.booking.startTime)}</span>}
          {v.calls.length > 0 && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-sky-300">{v.calls.length} call{v.calls.length > 1 ? "s" : ""}</span>}
          {v.visits > 1 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/60">{v.visits} visits</span>}
          {v.owner && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-300">you</span>}
          {v.bot && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/50">bot/test</span>}
          <span className="text-white/35">{ago(v.lastSeen)}</span>
        </div>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-white/55 sm:grid-cols-2">
        {v.location && (
          <div>
            <dt className="inline text-white/30">From </dt>
            <dd className="inline">{v.location}</dd>
          </div>
        )}
        {(v.network?.org || v.network?.host) && (
          <div>
            <dt className="inline text-white/30">Network </dt>
            <dd className="inline">
              <NetworkLine n={v.network} />
            </dd>
          </div>
        )}
        <div>
          <dt className="inline text-white/30">Came from </dt>
          <dd className="inline">{v.source ?? "direct / unknown"}</dd>
        </div>
        {v.device && (
          <div>
            <dt className="inline text-white/30">Device </dt>
            <dd className="inline">{v.device}</dd>
          </div>
        )}
        {v.clicks.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="inline text-white/30">Clicked </dt>
            <dd className="inline">{v.clicks.join(", ")}</dd>
          </div>
        )}
        {v.booking && (
          <div className="sm:col-span-2">
            <dt className="inline text-white/30">Booking </dt>
            <dd className="inline">
              {v.booking.name} ({v.booking.email}) for {when(v.booking.startTime)}
              {v.booking.status === "canceled" && " (canceled)"}
            </dd>
          </div>
        )}
      </dl>
      {v.calls.map((c) => (
        <div key={c.at} className="mt-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
            <span>Call {when(c.at)}</span>
            {c.durationS != null && <span>· {dur(c.durationS)}</span>}
            <span>· {pretty(c.intent)}</span>
            <span>· {pretty(c.outcome)}</span>
            {c.hiringFor && <span>· hiring for {c.hiringFor}</span>}
            {c.shareToken && (
              <a className="text-sky-300 hover:underline" href={`/call/${c.shareToken}`}>
                shared transcript
              </a>
            )}
          </div>
          {c.summary && <p className="mt-1 text-sm text-white/75">{c.summary}</p>}
          {c.questions.length > 0 && (
            <div className="mt-1.5">
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-white/60">
                {(open ? c.questions : c.questions.slice(0, 4)).map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              {c.questions.length > 4 && (
                <button className="mt-1 text-[11px] text-sky-300 hover:underline" onClick={() => setOpen((o) => !o)}>
                  {open ? "show less" : `show all ${c.questions.length} lines`}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </li>
  );
}

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const [all, setAll] = useState(false);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics?days=${days}${all ? "&all=1" : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "Access denied" : res.status === 401 ? "Sign in to see analytics" : "Failed to load");
        return res.json();
      })
      .then((d: Data) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        // This browser is Ariv's: keep his own visits and test calls out of the numbers.
        markOwnerBrowser();
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days, all]);

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="animate-pulse text-white/40">Loading analytics...</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }
  if (!data) return null;
  const o = data.overview;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Who&apos;s talking to your AI</h1>
            <p className="mt-1 text-sm text-white/40">Visits, calls, questions and bookings from arivsai.app</p>
          </div>
          <AuthHeader />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex overflow-hidden rounded-lg border border-white/15" role="group" aria-label="Date range">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => {
                  setLoading(true);
                  setDays(d);
                }}
                aria-pressed={days === d}
                className={`px-3 py-1.5 ${days === d ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/5"}`}
              >
                {d} days
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-white/60">
            <input type="checkbox" checked={all} onChange={(e) => {
                setLoading(true);
                setAll(e.target.checked);
              }} className="accent-sky-400" />
            Include my own visits and automated tests
          </label>
          {loading && <span className="text-xs text-white/40">Refreshing...</span>}
          {!all && (data.meta.excludedOwner > 0 || data.meta.excludedBots > 0) && (
            <span className="text-xs text-white/35">
              Hiding {data.meta.excludedOwner} of yours, {data.meta.excludedBots} bot/test
            </span>
          )}
        </div>

        {data.meta.migrationPending && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Visitor analytics need a one-time database update: run <code>web/scripts/migrate-v4.sql</code> in the Supabase SQL editor.
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Visitors" value={o.visitors} sub={`${o.returning} came back`} />
          <Stat label="Visits" value={o.visits} />
          <Stat label="Calls" value={o.calls} sub={o.avgCallSeconds ? `avg ${dur(o.avgCallSeconds)}` : undefined} />
          <Stat label="Identified" value={o.identified} sub="said, signed in or booked" />
          <Stat label="Booking clicks" value={o.bookingClicks} />
          <Stat label="Bookings" value={data.meta.bookingsAvailable === false ? "n/a" : o.bookings} sub="on Calendly" />
        </div>

        <Panel title="Visits and calls per day" className="mt-5">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily}>
                <XAxis dataKey="date" tick={{ fill: "#ffffff40", fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={20} />
                <YAxis tick={{ fill: "#ffffff40", fontSize: 10 }} allowDecimals={false} width={28} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="visits" stroke="#60a5fa" fill="#60a5fa22" strokeWidth={2} />
                <Area type="monotone" dataKey="calls" stroke="#34d399" fill="#34d39922" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={`Who's been here (${data.visitors.length})`} className="mt-5">
          {data.visitors.length === 0 ? (
            <p className="text-sm text-white/30">No visitors in this range yet.</p>
          ) : (
            <>
              <ul className="space-y-3">
                {data.visitors.slice(0, limit).map((v) => (
                  <VisitorItem key={v.id} v={v} />
                ))}
              </ul>
              {data.visitors.length > limit && (
                <button className="mt-3 text-sm text-sky-300 hover:underline" onClick={() => setLimit((l) => l + 25)}>
                  Show more
                </button>
              )}
            </>
          )}
        </Panel>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="What people asked (latest)">
            {data.recentQuestions.length === 0 ? (
              <p className="text-sm text-white/30">No calls yet.</p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 text-sm">
                {data.recentQuestions.map((q, i) => (
                  <li key={i}>
                    <div className="text-white/80">{q.text}</div>
                    <div className="text-[11px] text-white/35">
                      {[q.who, q.where, ago(q.at)].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Top topics">
            {data.topTopics.length === 0 ? (
              <p className="text-sm text-white/30">No calls yet.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topTopics.slice(0, 10)} layout="vertical">
                    <XAxis type="number" tick={{ fill: "#ffffff40", fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" tick={{ fill: "#ffffff70", fontSize: 11 }} width={140} />
                    <Tooltip contentStyle={TOOLTIP} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Panel title="Came from">
            <CountList rows={data.sources} empty="No visits yet." />
          </Panel>
          <Panel title="Locations">
            <CountList rows={data.locations} empty="No visits yet." />
          </Panel>
          <Panel title="Networks">
            <CountList rows={data.networks} empty="No network data yet." />
          </Panel>
          <Panel title="Devices">
            <CountList rows={data.devices} empty="No visits yet." />
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Panel title="Caller intent">
            <CountList rows={data.intents.map((r) => ({ ...r, name: pretty(r.name) }))} empty="No calls yet." />
          </Panel>
          <Panel title="Call outcomes">
            <CountList rows={data.outcomes.map((r) => ({ ...r, name: pretty(r.name) }))} empty="No calls yet." />
          </Panel>
        </div>

        <Panel title="Calendly bookings" className="mt-5">
          {data.meta.bookingsAvailable === false ? (
            <p className="text-sm text-white/30">Couldn&apos;t reach Calendly right now.</p>
          ) : data.bookings.length === 0 ? (
            <p className="text-sm text-white/30">No bookings in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/30">
                    <th className="pb-2 pr-4">Who</th>
                    <th className="pb-2 pr-4">Meeting</th>
                    <th className="pb-2 pr-4">Booked</th>
                    <th className="pb-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={`${b.email}-${b.startTime}`} className="border-b border-white/5">
                      <td className="py-2 pr-4 text-white/80">
                        {b.name} <span className="text-xs text-white/40">{b.email}</span>
                      </td>
                      <td className="py-2 pr-4 text-white/60">
                        {when(b.startTime)}
                        {b.status === "canceled" && " (canceled)"}
                      </td>
                      <td className="py-2 pr-4 text-white/40">{ago(b.bookedAt)}</td>
                      <td className="py-2 text-white/50">{b.matched ? "this site (matched)" : b.utmSource === "arivsai" ? "this site" : "elsewhere"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <p className="mt-6 text-xs leading-5 text-white/30">
          Location and network are approximate, from the IP address. A company shows up only when someone browses from an office network;
          home and mobile ISPs are labeled. Names come only from what people say on a call, a sign-in, or a Calendly booking. Visitors in
          the EEA, UK and Switzerland, and browsers with Do Not Track or Global Privacy Control, stay anonymous.
        </p>
      </div>
    </div>
  );
}
