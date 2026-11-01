"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { LINKS, tagBookingUrl } from "@/lib/knowledge";
import { CallButton, MuteButton, type Phase } from "./CallControls";
import { PostCallPanel, type PostState } from "./PostCallPanel";
import { FaviconAnimator } from "./FaviconAnimator";
import { StatusLine } from "./StatusLine";
import { CardTray } from "./CardTray";
import { TranscriptDialog } from "./TranscriptDialog";
import { TranscriptLines } from "./TranscriptLog";
import { TranscriptStrip } from "./TranscriptStrip";
import { reportError } from "@/lib/report-error";
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
  const [logOpen, setLogOpen] = useState(false);

  const sessionRef = useRef<VoiceSession | null>(null);
  const infoRef = useRef<SessionInfo | null>(null);
  const itemsRef = useRef<TranscriptItem[]>([]);
  const finishedRef = useRef(false);
  const liveAtRef = useRef<number | null>(null);
  const modeRef = useRef("greeter");
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const postRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    itemsRef.current = transcript.items;
  }, [transcript.items]);

  const finish = useCallback(async (viaBeacon = false) => {
    const info = infoRef.current;
    if (!info || finishedRef.current) return;
    const body = JSON.stringify({ ticket: info.ticket, messages: toMessages(itemsRef.current), liveAt: sessionRef.current?.liveAt?.() ?? liveAtRef.current ?? undefined });
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
      liveAtRef.current = sessionRef.current?.liveAt?.() ?? liveAtRef.current;
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
    liveAtRef.current = null;
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
          onCaption: ({ utterance, text, settled }) => dispatch({ type: "userPartial", utterance, text, settled }),
          onCaptionCancel: () => dispatch({ type: "userPartialCancel" }),
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
        if (!e) reportError(err, "start");
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
  const onLink = (label: string, href: string) => trackClick(label, href, sessionId);
  const showPost = phase === "ended" && !!post;

  // The panel sits below the fold of the fixed stage: bring it into view once.
  useEffect(() => {
    if (!showPost) return;
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    postRef.current?.scrollIntoView?.({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
  }, [showPost, post?.saving]);

  return (
    <div className="relative bg-background text-foreground">
      <FaviconAnimator enabled={live} />
      <header className="px-5 py-4 sm:px-8 print:hidden">
        <h1 className="font-serif text-lg italic tracking-wide text-primary/80">Ariv&apos;s AI</h1>
      </header>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`absolute inset-x-0 top-14 z-10 mx-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border px-4 py-3 text-sm print:hidden ${
            notice.tone === "error" ? "border-red-500/30 bg-red-950 text-red-100" : "border-white/15 bg-neutral-900 text-white/80"
          }`}
        >
          {notice.text}
          {notice.showLinks && <FallbackLinks />}
        </div>
      )}

      {/* Every row has a fixed size in every phase, so the orb and pill never move. */}
      <main>
        <div className="grid h-[calc(100svh-6.25rem)] min-h-[28rem] grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto_1fr] justify-items-center pb-2 pt-2 print:hidden">
          <section className="row-start-2 flex flex-col items-center" aria-label="Call">
            <div className="call-orb overflow-hidden rounded-full">
              <VoicePoweredOrb hue={0} getLevel={getLevel} />
            </div>
            <div className="relative mt-8">
              <CallButton phase={phase} onStart={() => void start()} onHangUp={hangUp} />
              {live && (
                <div className="absolute left-full top-1/2 ml-3 -translate-y-1/2">
                  <MuteButton muted={muted} onToggle={toggleMute} />
                </div>
              )}
            </div>
          </section>

          <section className="row-start-3 flex w-full max-w-xl flex-col items-center" aria-label="Conversation">
            <StatusLine status={status} secondsLeft={secondsLeft} live={live} />
            <TranscriptStrip items={transcript.items} onExpand={() => setLogOpen(true)} />
            <CardTray items={transcript.items} onLink={onLink} onRecap={() => setLogOpen(true)} />
          </section>
        </div>

        {showPost && post && (
          <div ref={postRef} className="mx-auto w-full max-w-md scroll-mb-12 px-4 pb-6 print:hidden">
            <PostCallPanel
              post={post}
              shareUrl={shareUrl}
              sessionId={sessionId}
              onRetry={() => void finish()}
              onShare={() => void createShareLink()}
              onPrint={() => window.print()}
            />
          </div>
        )}

        {/* What "Print or save as PDF" prints. */}
        <div data-print="transcript" className="hidden space-y-3 p-4 print:block">
          <TranscriptLines items={transcript.items} onLink={onLink} />
        </div>

        {logOpen && <TranscriptDialog items={transcript.items} onLink={onLink} onClose={() => setLogOpen(false)} />}
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
