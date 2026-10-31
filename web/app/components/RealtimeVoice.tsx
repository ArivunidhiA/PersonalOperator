"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { LINKS, tagBookingUrl } from "@/lib/knowledge";
import { CallButton, MuteButton, type Phase } from "./CallControls";
import { PostCallPanel, type PostState } from "./PostCallPanel";
import { FaviconAnimator } from "./FaviconAnimator";
import { StatusLine } from "./StatusLine";
import { TranscriptLog } from "./TranscriptLog";
import { trackClick } from "@/lib/track-client";
import { detectAgentTransition, AGENT_MODES } from "@/lib/agents";
import { initialTranscript, toMessages, transcriptReducer, type TranscriptItem } from "@/lib/voice/transcript";
import type { EndReason, SessionInfo, VoiceSession } from "@/lib/voice/types";
// Static on purpose: iOS only allows audio if the AudioContext is created inside the tap,
// and a dynamic import here would put a network wait before it.
import { startVoiceCall, StartError } from "@/lib/voice/start";

const TOOL_LABELS: Record<string, string> = {
  retrieve_knowledge: "Checking his notes",
  research_role: "Looking into that role",
  check_availability: "Checking his calendar",
  schedule_meeting: "Making a booking link",
  share_links: "Grabbing links",
  generate_summary: "Writing a recap",
};

export default function RealtimeVoice() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, dispatch] = useReducer(transcriptReducer, initialTranscript);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "info"; showLinks?: boolean } | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [mode, setMode] = useState<string>("greeter");
  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [post, setPost] = useState<PostState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const sessionRef = useRef<VoiceSession | null>(null);
  const infoRef = useRef<SessionInfo | null>(null);
  const itemsRef = useRef<TranscriptItem[]>([]);
  const finishedRef = useRef(false);
  const modeRef = useRef("greeter");
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    itemsRef.current = transcript.items;
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
    setSessionId(null);
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
        setSessionId(info.sessionId);
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

  const createShareLink = async () => {
    const info = infoRef.current;
    if (!info) return;
    const res = await fetch("/api/calls/share", { method: "POST", headers: { "x-session-ticket": info.ticket } }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { share_token?: string; error?: string } | undefined;
    setPost((p) => (p ? { ...p, shareToken: res?.ok ? data?.share_token : undefined, shareError: res?.ok ? undefined : data?.error || "Couldn't make a link." } : p));
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
      <FaviconAnimator enabled={live} />
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <h1 className="text-sm font-medium tracking-wide text-white/70">Ariv&apos;s AI</h1>
        <div className="flex items-center gap-3">
          <CallButton phase={phase} onStart={() => void start()} onHangUp={hangUp} />
        </div>
      </header>

      {phase === "idle" && (
        <div className="mx-auto max-w-xl px-4 pt-2 text-center sm:px-6">
          <p className="text-base text-white/80">
            Talk to my AI. It knows what I work on, it can find time on my calendar, and yes, it&apos;s an AI.
          </p>
          <p className="mt-2 text-xs leading-5 text-white/40">
            Voice runs on Google&apos;s Gemini API (free tier), which may use calls to improve Google&apos;s models, so don&apos;t share
            anything sensitive. Transcripts are saved so I can read them, and I log basic visit info (rough location, network,
            device, where you came from, what you click) to see how people use this. Your browser&apos;s Do Not Track or Global
            Privacy Control setting turns that off.
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
          <StatusLine status={status} live={live} modeName={modeName} secondsLeft={secondsLeft} />
          {live && <MuteButton muted={muted} onToggle={toggleMute} />}
        </section>

        <section className="flex w-full max-w-md flex-col lg:mt-8" aria-label="Conversation">
          <TranscriptLog items={transcript.items} live={live} onLink={(label, href) => trackClick(label, href, sessionId)} />

          {phase === "ended" && post && (
            <PostCallPanel
              post={post}
              shareUrl={shareUrl}
              sessionId={sessionId}
              onRetry={() => void finish()}
              onShare={() => void createShareLink()}
              onPrint={() => window.print()}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function FallbackLinks() {
  const links = [
    { label: "LinkedIn", href: LINKS.linkedin },
    { label: "GitHub", href: LINKS.github },
    { label: "Book a 15-min chat", href: tagBookingUrl(LINKS.calendly) },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      {links.map((l) => (
        <a key={l.label} className="text-sky-300 hover:underline" href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => trackClick(l.label, l.href)}>
          {l.label}
        </a>
      ))}
    </div>
  );
}
