"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useUser as useClerkUser } from "@clerk/nextjs";
import { Mic, MicOff, PhoneOff, Copy, Check, Download, Mail, ExternalLink, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { AuthHeader } from "./AuthHeader";
import { LINKS } from "@/lib/knowledge";
import { detectAgentTransition, AGENT_MODES } from "@/lib/agents";
import { cardToText, isSafeUrl, type UiCard } from "@/lib/ui-cards";
import { initialTranscript, toMessages, transcriptReducer, type TranscriptItem } from "@/lib/voice/transcript";
import type { EndReason, SessionInfo, VoiceSession } from "@/lib/voice/types";
// Static on purpose: iOS only allows audio if the AudioContext is created inside the tap,
// and a dynamic import here would put a network wait before it.
import { startVoiceCall, StartError } from "@/lib/voice/start";

type Phase = "idle" | "connecting" | "live" | "ending" | "ended";

const TOOL_LABELS: Record<string, string> = {
  retrieve_knowledge: "Checking his notes",
  research_role: "Looking into that role",
  check_availability: "Checking his calendar",
  schedule_meeting: "Making a booking link",
  share_links: "Grabbing links",
  generate_summary: "Writing a recap",
};

function useSafeUser() {
  try {
    return useClerkUser();
  } catch {
    return { user: null, isSignedIn: false, isLoaded: true };
  }
}

// The speech transcriber adds em dashes as punctuation; show them as commas.
const displayText = (t: string) => t.replace(/\s*\u2014\s*/g, ", ");

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export default function RealtimeVoice() {
  const { isSignedIn } = useSafeUser();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, dispatch] = useReducer(transcriptReducer, initialTranscript);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "info"; showLinks?: boolean } | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [mode, setMode] = useState<string>("greeter");
  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [post, setPost] = useState<{
    shareToken?: string;
    shareError?: string;
    summary?: string;
    saving: boolean;
    failed?: boolean;
    emailed?: string;
    emailError?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const sessionRef = useRef<VoiceSession | null>(null);
  const infoRef = useRef<SessionInfo | null>(null);
  const itemsRef = useRef<TranscriptItem[]>([]);
  const finishedRef = useRef(false);
  const modeRef = useRef("greeter");
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  itemsRef.current = transcript.items;

  // Keep the newest line in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.items]);

  const finish = useCallback(async (viaBeacon = false) => {
    const info = infoRef.current;
    if (!info || finishedRef.current) return;
    const body = JSON.stringify({ ticket: info.ticket, messages: toMessages(itemsRef.current) });
    if (viaBeacon) {
      // Snapshot while the page may be going away. The server is save-or-update, so the
      // final save (if the page comes back) still updates it.
      const sent = navigator.sendBeacon?.("/api/calls/finish", new Blob([body], { type: "text/plain" }));
      if (!sent) void fetch("/api/calls/finish", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
      return;
    }
    finishedRef.current = true;
    setPost({ saving: true });
    try {
      const res = await fetch("/api/calls/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: string; skipped?: boolean };
      if (data.skipped) return setPost(null);
      if (!res.ok || !data.ok) throw new Error("save failed");
      setPost({ saving: false, summary: data.summary });
    } catch {
      finishedRef.current = false; // allow Retry
      setPost({ saving: false, failed: true });
    }
  }, []);

  const onEnded = useCallback(
    (reason: EndReason, message?: string) => {
      sessionRef.current = null;
      setAgentSpeaking(false);
      setActiveTool(null);
      setPhase("ended");
      if (message) setNotice({ text: message, tone: reason === "hangup" || reason === "time" ? "info" : "error", showLinks: reason === "quota" });
      if (reason !== "hidden") void finish();
    },
    [finish],
  );

  const start = useCallback(async () => {
    if (phase === "connecting" || phase === "live") return;
    setNotice(null);
    setPost(null);
    dispatch({ type: "reset" });
    finishedRef.current = false;
    infoRef.current = null;
    cancelRef.current = false;
    abortRef.current = new AbortController();
    modeRef.current = "greeter";
    setMode("greeter");
    setMuted(false);
    setPhase("connecting");
    try {
        const { session, info } = await startVoiceCall({
          onLive: () => setPhase("live"),
          onUserDelta: (text) => dispatch({ type: "userDelta", text }),
          onUserFinal: (text) => dispatch({ type: "userFinal", text }),
          onAgentDelta: (text) => dispatch({ type: "agentDelta", text }),
          onAgentFinal: (text) => dispatch({ type: "agentFinal", text }),
          onAgentSpeaking: setAgentSpeaking,
          onToolStart: (name) => {
            setActiveTool(name);
            const next = detectAgentTransition(modeRef.current, name);
            if (next) {
              modeRef.current = next.id;
              setMode(next.id);
            }
          },
          onToolEnd: (_name, _ok, card) => {
            setActiveTool(null);
            if (card) dispatch({ type: "card", card });
          },
          onEnded,
        }, abortRef.current?.signal);
        sessionRef.current = session;
        infoRef.current = info;
        setSecondsLeft(info.maxCallSeconds);
        if (cancelRef.current) session.stop("hangup"); // Cancel was pressed while connecting
      } catch (err) {
        setPhase("idle");
        const e = err instanceof StartError ? err : null;
        if (e?.code === "cancelled") return;
        setNotice({
          text: e?.message ?? "Couldn't start the call. Try again in a minute.",
          tone: "error",
          showLinks: !!e && ["region", "offline", "busy", "unsupported", "quota"].includes(e.code),
        });
    }
  }, [phase, onEnded]);

  const hangUp = useCallback(() => {
    if (!sessionRef.current) {
      // Still setting up: abort the setup (releases the mic), or cancel once the session exists.
      cancelRef.current = true;
      abortRef.current?.abort();
      return;
    }
    setPhase("ending");
    sessionRef.current.stop("hangup");
  }, []);

  // Call timer: warn near the end, then wrap up.
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          sessionRef.current?.stop("time");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Leaving the page ends the call and still saves the transcript. Backgrounding
  // (e.g. tapping a link in the chat on a phone) keeps the call going but saves a
  // snapshot, since mobile browsers may kill a background tab without pagehide.
  useEffect(() => {
    const onHide = () => {
      if (sessionRef.current) {
        void finish(true);
        sessionRef.current.stop("hidden");
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && sessionRef.current) void finish(true);
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      sessionRef.current?.stop("hidden");
    };
  }, [finish]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sessionRef.current?.setMuted(next);
  };

  const getLevel = useCallback(() => {
    const l = sessionRef.current?.levels();
    return l ? Math.max(l.mic, l.agent) : 0;
  }, []);

  const downloadPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 20;
    doc.setFontSize(14);
    doc.text("Conversation with Ariv's AI", 20, y);
    y += 12;
    doc.setFontSize(10);
    for (const it of itemsRef.current) {
      const text = it.role === "card" ? cardToText(it.card) : `${it.role === "user" ? "You" : "Ariv's AI"}: ${it.text}`;
      // jsPDF's built-in font is Latin-1 only; keep the text readable instead of garbled.
      const safe = text.normalize("NFKD").replace(/[^\x20-\x7E\n]/g, "");
      for (const line of doc.splitTextToSize(safe, 170) as string[]) {
        if (y > pageH - 15) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, 20, y);
        y += 6;
      }
      y += 3;
    }
    doc.save("ariv-ai-conversation.pdf");
  };

  const createShareLink = async () => {
    const info = infoRef.current;
    if (!info) return;
    const res = await fetch("/api/calls/share", { method: "POST", headers: { "x-session-ticket": info.ticket } }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { share_token?: string; error?: string } | undefined;
    setPost((p) => (p ? { ...p, shareToken: res?.ok ? data?.share_token : undefined, shareError: res?.ok ? undefined : data?.error || "Couldn't make a link." } : p));
  };

  const emailTranscript = async () => {
    const info = infoRef.current;
    if (!info) return;
    const res = await fetch("/api/calls/email", { method: "POST", headers: { "x-session-ticket": info.ticket } }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { to?: string; error?: string } | undefined;
    setPost((p) => (p ? { ...p, emailed: res?.ok ? data?.to : undefined, emailError: res?.ok ? undefined : data?.error || "Couldn't send it." } : p));
  };

  const shareUrl = post?.shareToken && typeof window !== "undefined" ? `${window.location.origin}/call/${post.shareToken}` : null;
  const live = phase === "live";
  const status = !live
    ? phase === "connecting"
      ? "Connecting…"
      : ""
    : activeTool
      ? `${TOOL_LABELS[activeTool] ?? "Working"}…`
      : agentSpeaking
        ? "Speaking"
        : muted
          ? "Muted"
          : "Listening";
  const orbHue = phase === "connecting" ? 280 : agentSpeaking ? 205 : live ? 235 : 240;
  const modeName = AGENT_MODES.find((m) => m.id === mode)?.name;

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <h1 className="text-sm font-medium tracking-wide text-white/70">Ariv&apos;s AI</h1>
        <div className="flex items-center gap-3">
          <AuthHeader />
          {/* One persistent button (label/action change) so keyboard focus isn't lost. */}
          <Button
            onClick={live || phase === "connecting" ? hangUp : () => void start()}
            disabled={phase === "ending"}
            variant={live || phase === "connecting" ? "destructive" : "default"}
            className="rounded-full px-5 text-sm"
          >
            {live ? (
              <>
                <PhoneOff className="mr-2 h-4 w-4" aria-hidden />
                End call
              </>
            ) : phase === "connecting" ? (
              "Cancel"
            ) : phase === "ending" ? (
              "Ending…"
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" aria-hidden />
                {phase === "ended" ? "Talk again" : "Start talking"}
              </>
            )}
          </Button>
        </div>
      </header>

      {phase === "idle" && (
        <div className="mx-auto max-w-xl px-4 pt-2 text-center sm:px-6">
          <p className="text-base text-white/80">
            Talk to my AI. It knows what I work on, it can find time on my calendar, and yes, it&apos;s an AI.
          </p>
          <p className="mt-2 text-xs leading-5 text-white/40">
            Voice runs on Google&apos;s Gemini API (free tier), which may use calls to improve Google&apos;s models, so don&apos;t share
            anything sensitive. Transcripts are saved so I can read them.
          </p>
        </div>
      )}

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mx-auto mt-3 w-[calc(100%-2rem)] max-w-xl rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-100" : "border-white/15 bg-white/5 text-white/80"
          }`}
        >
          {notice.text}
          {notice.showLinks && <FallbackLinks />}
        </div>
      )}

      <main className="flex flex-1 flex-col items-center gap-6 px-4 pb-8 pt-4 lg:flex-row lg:items-start lg:justify-center lg:gap-12 lg:px-6">
        <section className="flex flex-col items-center" aria-label="Call">
          <div className="relative h-60 w-60 sm:h-72 sm:w-72 lg:h-[26rem] lg:w-[26rem]">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500/15 via-purple-500/15 to-fuchsia-500/15 blur-3xl" />
            <div className="relative h-full w-full overflow-hidden rounded-full">
              <VoicePoweredOrb hue={orbHue} getLevel={getLevel} />
            </div>
          </div>
          <div className="mt-3 flex h-6 items-center gap-3 text-xs text-white/50">
            <span aria-live="polite">{status}</span>
            {live && modeName && <span className="text-emerald-300/50">{modeName}</span>}
            {live && (
              <span aria-hidden className={secondsLeft <= 60 ? "text-amber-300" : "text-white/30"}>
                {fmt(secondsLeft)} left
              </span>
            )}
            <span className="sr-only" aria-live="polite">
              {live && secondsLeft <= 60 && secondsLeft > 55 ? "One minute left in this call." : ""}
            </span>
          </div>
          {live && (
            <Button
              onClick={toggleMute}
              variant="secondary"
              size="sm"
              className="mt-3 rounded-full"
              aria-pressed={muted}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            >
              {muted ? <MicOff className="mr-2 h-4 w-4" aria-hidden /> : <Mic className="mr-2 h-4 w-4" aria-hidden />}
              {muted ? "Unmute" : "Mute"}
            </Button>
          )}
        </section>

        <section className="flex w-full max-w-md flex-col lg:mt-8" aria-label="Conversation">
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            className="max-h-[45vh] min-h-[6rem] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:max-h-[60vh]"
          >
            {transcript.items.length === 0 ? (
              <p className="text-sm text-white/30">
                {live ? "Say hi, or ask what Ariv's working on." : "The conversation will show up here."}
              </p>
            ) : (
              transcript.items.map((it) =>
                it.role === "card" ? (
                  <CardView key={it.id} card={it.card} />
                ) : (
                  <div key={it.id} className="text-sm leading-6" aria-hidden={!it.final || undefined}>
                    <span className="mr-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
                      {it.role === "user" ? "You" : "Ariv's AI"}
                    </span>
                    <span className={it.final ? "text-white/85" : "text-white/50"}>{displayText(it.text)}</span>
                  </div>
                ),
              )
            )}
          </div>

          {phase === "ended" && post && (
            <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-5">
              <h2 className="text-base font-semibold">
                {post.saving ? "Saving your transcript…" : post.failed ? "Couldn't save the transcript" : "Your transcript"}
              </h2>
              {post.failed && (
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => void finish()}>
                  Retry
                </Button>
              )}
              {post.summary && <p className="mt-1 text-sm text-white/60">{post.summary}</p>}
              {!post.saving && !post.failed && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {!shareUrl && (
                    <Button variant="secondary" size="sm" className="gap-2" onClick={() => void createShareLink()}>
                      <Copy className="h-4 w-4" aria-hidden />
                      Create share link
                    </Button>
                  )}
                  {shareUrl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {
                          window.prompt("Copy this link:", shareUrl);
                        }
                      }}
                    >
                      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                      {copied ? "Copied" : "Copy share link"}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" className="gap-2" onClick={() => void downloadPdf()}>
                    <Download className="h-4 w-4" aria-hidden />
                    Download PDF
                  </Button>
                  {isSignedIn && (
                    <Button variant="secondary" size="sm" className="gap-2" onClick={() => void emailTranscript()} disabled={!!post.emailed}>
                      <Mail className="h-4 w-4" aria-hidden />
                      {post.emailed ? "Sent" : "Email it to me"}
                    </Button>
                  )}
                  <a
                    href={LINKS.calendly}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-sm text-white/85 hover:bg-white/10"
                  >
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    Book time with Ariv
                  </a>
                </div>
              )}
              {post.shareError && <p className="mt-2 text-xs text-red-200">{post.shareError}</p>}
              {post.emailed && <p className="mt-2 text-xs text-white/50">Sent to {post.emailed}.</p>}
              {post.emailError && <p className="mt-2 text-xs text-red-200">{post.emailError}</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function CardView({ card }: { card: UiCard }) {
  if (card.kind === "links") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">{card.title}</div>
        <ul className="mt-2 space-y-1">
          {card.links.filter((l) => isSafeUrl(l.url) || l.url.startsWith("mailto:")).map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 hover:underline">
                {l.label}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (card.kind === "booking") {
    return (
      <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3">
        <div className="text-sm font-medium text-white/90">{card.title}</div>
        <div className="mt-0.5 text-sm text-white/60">{card.when}</div>
        {isSafeUrl(card.url) && (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-sky-500/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            Confirm on Calendly
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">{card.title}</div>
      <ul className="mt-1 space-y-0.5 text-sm text-white/75">
        {card.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function FallbackLinks() {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      <a className="text-sky-300 hover:underline" href={LINKS.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <a className="text-sky-300 hover:underline" href={LINKS.github} target="_blank" rel="noopener noreferrer">GitHub</a>
      <a className="text-sky-300 hover:underline" href={LINKS.calendly} target="_blank" rel="noopener noreferrer">Book a 15-min chat</a>
    </div>
  );
}
