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
import { detectAgentTransition } from "@/lib/agents";
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
  const hasConversation = transcript.items.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <FaviconAnimator enabled={live} />
      <header className="px-5 py-4 sm:px-8 print:hidden">
        <h1 className="font-serif text-lg italic tracking-wide text-primary/80">Ariv&apos;s AI</h1>
      </header>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mx-auto mt-3 w-[calc(100%-2rem)] max-w-xl rounded-xl border px-4 py-3 text-sm print:hidden ${
            notice.tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-100" : "border-white/15 bg-white/5 text-white/80"
          }`}
        >
          {notice.text}
          {notice.showLinks && <FallbackLinks />}
        </div>
      )}

      <main
        className={`flex flex-1 flex-col items-center gap-8 px-4 pb-10 pt-2 ${
          hasConversation ? "lg:flex-row lg:items-start lg:justify-center lg:gap-14 lg:px-6" : "justify-center"
        }`}
      >
        <section className="flex flex-col items-center print:hidden" aria-label="Call">
          <div className="h-64 w-64 overflow-hidden rounded-full sm:h-80 sm:w-80 lg:h-[26rem] lg:w-[26rem]">
            <VoicePoweredOrb hue={0} getLevel={getLevel} />
          </div>
          <div className="mt-8">
            <CallButton phase={phase} onStart={() => void start()} onHangUp={hangUp} />
          </div>
          <StatusLine status={status} secondsLeft={secondsLeft} live={live} />
          {live && <MuteButton muted={muted} onToggle={toggleMute} />}
        </section>

        {(hasConversation || (phase === "ended" && post)) && (
          <section className="flex w-full max-w-md flex-col lg:mt-8" aria-label="Conversation">
            {hasConversation && <TranscriptLog items={transcript.items} onLink={(label, href) => trackClick(label, href, sessionId)} />}

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
        )}
      </main>

      <footer className="px-5 pb-6 text-center text-xs print:hidden">
        <a href="/privacy" className="text-white/60 underline-offset-4 hover:text-white/90 hover:underline">
          How this works · Privacy
        </a>
      </footer>
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
        <a key={l.label} className="text-ivory hover:underline" href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => trackClick(l.label, l.href)}>
          {l.label}
        </a>
      ))}
    </div>
  );
}
