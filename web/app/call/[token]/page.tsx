"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface CallData {
  caller: string;
  company: string | null;
  intent: string;
  summary: string;
  topics: string[];
  outcome: string;
  date: string;
  transcript: { role: string; text: string }[];
}

export default function SharedCallPage() {
  const { token } = useParams<{ token: string }>();
  const [call, setCall] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/calls/${token}`)
      .then((res) => {
        if (res.status === 404) throw new Error("This call transcript was not found.");
        if (res.status === 410) throw new Error("This link has expired.");
        if (!res.ok) throw new Error("Failed to load transcript.");
        return res.json();
      })
      .then(setCall)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="animate-pulse text-white/40">Loading transcript...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
        <div className="text-lg text-red-400">{error}</div>
        <Link href="/" className="mt-4 text-sm text-blue-400 hover:text-blue-300">
          Talk to Ariv&apos;s AI &rarr;
        </Link>
      </div>
    );
  }

  if (!call) return null;

  const formattedDate = new Date(call.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {/* Header */}
        <div className="mb-8 border-b border-white/10 pb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-400">
              {call.caller.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{call.caller}</h1>
              {call.company && <p className="text-sm text-white/40">{call.company}</p>}
            </div>
          </div>
          <p className="mt-4 text-sm text-white/40">{formattedDate}</p>

          {/* Metadata badges */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs text-blue-300">
              {(call.intent || "unknown").replace(/_/g, " ")}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs ${call.outcome === "meeting_scheduled" ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/40"}`}>
              {(call.outcome || "unknown").replace(/_/g, " ")}
            </span>
          </div>

          {/* Summary */}
          {call.summary && (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-white/30">Summary</div>
              <p className="mt-2 text-sm leading-6 text-white/70">{call.summary}</p>
            </div>
          )}

          {/* Topics */}
          {call.topics.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {call.topics.map((t) => (
                <span key={t} className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs text-purple-300">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Transcript */}
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-white/30">Transcript</h2>
          <div className="mt-4 space-y-4">
            {call.transcript.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "Caller" ? "" : "flex-row-reverse"}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${m.role === "Caller" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                  {m.role === "Caller" ? "C" : "AI"}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.role === "Caller" ? "bg-white/5 text-white/70" : "bg-blue-500/10 text-white/80"}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-xl border border-white/10 bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-6 text-center">
          <p className="text-lg font-semibold">Want to learn more about Ariv?</p>
          <p className="mt-1 text-sm text-white/40">Talk to his AI voice agent directly</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-400 transition-colors"
          >
            Start a Conversation
          </Link>
        </div>
      </div>
    </div>
  );
}
