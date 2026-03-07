"use client";

import { useEffect, useState } from "react";
import { AuthHeader } from "@/app/components/AuthHeader";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

interface Analytics {
  overview: {
    totalCalls: number;
    uniqueCallers: number;
    returningCallers: number;
    meetingsScheduled: number;
    conversionRate: string;
  };
  intentDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  topTopics: { topic: string; count: number }[];
  topCompanies: { company: string; count: number }[];
  callsOverTime: { date: string; count: number }[];
  recentCalls: {
    id: string;
    caller_name: string;
    caller_email: string;
    intent: string;
    summary: string;
    outcome: string;
    company: string;
    created_at: string;
    share_token: string;
  }[];
  topCallers: {
    name: string;
    email: string;
    company: string;
    call_count: number;
    last_seen: string;
  }[];
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#6366f1", "#f97316", "#14b8a6",
];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-2 text-3xl font-bold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-white/30">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "Access denied" : "Failed to load");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="animate-pulse text-white/40">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const intentData = Object.entries(data.intentDistribution).map(([name, value]) => ({ name, value }));
  const outcomeData = Object.entries(data.outcomeDistribution).map(([name, value]) => ({ name, value }));

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="mt-1 text-sm text-white/40">Voice agent performance dashboard</p>
          </div>
          <AuthHeader />
        </div>

        {/* Overview Stats */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Total Calls" value={data.overview.totalCalls} />
          <StatCard label="Unique Callers" value={data.overview.uniqueCallers} />
          <StatCard label="Returning" value={data.overview.returningCallers} sub={`${data.overview.uniqueCallers > 0 ? ((data.overview.returningCallers / data.overview.uniqueCallers) * 100).toFixed(0) : 0}% return rate`} />
          <StatCard label="Meetings Booked" value={data.overview.meetingsScheduled} />
          <StatCard label="Conversion" value={data.overview.conversionRate} sub="calls → meetings" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Calls Over Time */}
          {data.callsOverTime.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">Calls Over Time</h2>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.callsOverTime}>
                    <defs>
                      <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#ffffff40", fontSize: 10 }} tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                    <YAxis tick={{ fill: "#ffffff40", fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px", color: "#fff" }} />
                    <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#callsGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Intent Distribution */}
          {intentData.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">Caller Intent</h2>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={intentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {intentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px", color: "#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Topics */}
          {data.topTopics.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">Top Topics</h2>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topTopics.slice(0, 8)} layout="vertical">
                    <XAxis type="number" tick={{ fill: "#ffffff40", fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="topic" type="category" tick={{ fill: "#ffffff60", fontSize: 11 }} width={120} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px", color: "#fff" }} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Companies */}
          {data.topCompanies.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">Companies</h2>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topCompanies.slice(0, 8)} layout="vertical">
                    <XAxis type="number" tick={{ fill: "#ffffff40", fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="company" type="category" tick={{ fill: "#ffffff60", fontSize: 11 }} width={120} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px", color: "#fff" }} />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Outcome Distribution */}
        {outcomeData.length > 0 && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">Call Outcomes</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {outcomeData.map((o, i) => (
                <div key={o.name} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-sm text-white/60">{o.name.replace(/_/g, " ")}</span>
                  <span className="text-sm font-semibold text-white">{o.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Calls */}
        {data.recentCalls.length > 0 && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">Recent Calls</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/30">
                    <th className="pb-3 pr-4">Caller</th>
                    <th className="pb-3 pr-4">Company</th>
                    <th className="pb-3 pr-4">Intent</th>
                    <th className="pb-3 pr-4">Outcome</th>
                    <th className="pb-3 pr-4">When</th>
                    <th className="pb-3">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCalls.map((c) => (
                    <tr key={c.id} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white/70">{c.caller_name || c.caller_email || "Anonymous"}</td>
                      <td className="py-3 pr-4 text-white/50">{c.company || "—"}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
                          {(c.intent || "unknown").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${c.outcome === "meeting_scheduled" ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/40"}`}>
                          {(c.outcome || "unknown").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-white/40">
                        {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td className="py-3">
                        {c.share_token && (
                          <a href={`/call/${c.share_token}`} className="text-blue-400 hover:text-blue-300 text-xs">View</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
