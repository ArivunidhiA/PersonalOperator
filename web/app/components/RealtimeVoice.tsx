"use client";

import { Button } from "@/components/ui/button";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { Mic, MicOff, Copy, Download, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser as useClerkUser } from "@clerk/nextjs";
import { AuthHeader } from "./AuthHeader";
import { jsPDF } from "jspdf";

const APP_URL = typeof window !== "undefined" ? window.location.origin : "https://arivsai.app";

function toFriendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("unauthorized") || lower.includes("401")) return "Please sign in to continue.";
  if (lower.includes("rate limit") || lower.includes("429")) return "You've reached the limit for now. Try again in a bit, or sign in for more sessions.";
  if (lower.includes("microphone") || lower.includes("getusermedia") || lower.includes("permission")) return "Microphone access is needed. Check your browser settings and allow microphone access for this site.";
  if (lower.includes("failed to establish") || lower.includes("webrtc") || lower.includes("connection")) return "We couldn't connect. Check your internet and try again.";
  if (lower.includes("max reconnection") || lower.includes("reconnection attempts")) return "Connection was lost. Tap Connect to start a new conversation.";
  if (lower.includes("network") || lower.includes("fetch")) return "Network issue. Check your connection and try again.";
  return raw;
}

type Role = "user" | "assistant";

type TranscriptMessage = {
  id: string;
  role: Role;
  text: string;
  final: boolean;
};

const MAX_RECONNECT_ATTEMPTS = 5;
const TOKEN_REFRESH_BUFFER_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/10 ${className}`}
    />
  );
}

function useSafeUser() {
  try {
    return useClerkUser();
  } catch {
    return { user: null, isLoaded: true, isSignedIn: false };
  }
}

export default function RealtimeVoice() {
  const { user } = useSafeUser();
  const callerName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "";
  const callerEmail = user?.primaryEmailAddress?.emailAddress || "";

  const callerNameRef = useRef(callerName);
  const callerEmailRef = useRef(callerEmail);
  callerNameRef.current = callerName;
  callerEmailRef.current = callerEmail;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const sidebandActiveRef = useRef(false);

  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);

  const tokenExpiresAtRef = useRef<number>(0);
  const tokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionIdRef = useRef<string>("");
  const callIdRef = useRef<string>("");
  const postCallFiredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceQuietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  interface SystemActivity {
    id: string;
    intent: string;
    action: string;
    status: "running" | "done" | "error";
    timestamp: number;
  }

  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error" | "reconnecting"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [activities, setActivities] = useState<SystemActivity[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor" | "">("");
  const [activeAgent, setActiveAgent] = useState<string>("Greeter");
  const [postCallData, setPostCallData] = useState<{ shareToken: string; summary?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const latencyRef = useRef<number[]>([]);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mobileTranscriptRef = useRef<HTMLDivElement | null>(null);

  const toolLabels: Record<string, { intent: string; action: string }> = {
    check_availability: { intent: "Scheduling", action: "Checking calendar" },
    schedule_meeting: { intent: "Scheduling", action: "Booking meeting" },
    send_confirmation_email: { intent: "Email", action: "Sending confirmation" },
    retrieve_knowledge: { intent: "Knowledge", action: "Searching knowledge base" },
    lookup_caller: { intent: "Memory", action: "Looking up caller" },
    research_role: { intent: "Role Research", action: "Researching role fit" },
    generate_summary: { intent: "Summary", action: "Generating recap" },
  };

  const handleVoiceDetected = useCallback((detected: boolean) => {
    if (detected) {
      if (voiceQuietTimerRef.current) {
        clearTimeout(voiceQuietTimerRef.current);
        voiceQuietTimerRef.current = null;
      }
      setVoiceDetected(true);
    } else {
      if (!voiceQuietTimerRef.current) {
        voiceQuietTimerRef.current = setTimeout(() => {
          setVoiceDetected(false);
          voiceQuietTimerRef.current = null;
        }, 3000);
      }
    }
  }, []);

  const upsertDelta = useCallback((id: string, role: Role, delta: string) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === id);
      if (index === -1) return [...prev, { id, role, text: delta, final: false }];
      const next = [...prev];
      next[index] = { ...next[index], text: next[index].text + delta };
      return next;
    });
  }, []);

  const finalize = useCallback((id: string, role: Role, transcript: string) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === id);
      if (index === -1) return [...prev, { id, role, text: transcript, final: true }];
      const next = [...prev];
      next[index] = { ...next[index], text: transcript, final: true };
      return next;
    });
  }, []);

  const saveConversation = useCallback((msgs: TranscriptMessage[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const finalized = msgs.filter((m) => m.final);
    if (finalized.length === 0) return;
    void fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid, messages: finalized }),
    }).catch(() => null);
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (tokenTimerRef.current) { clearTimeout(tokenTimerRef.current); tokenTimerRef.current = null; }
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
  }, []);

  const teardownConnection = useCallback(() => {
    clearTimers();
    try { dcRef.current?.close(); } catch { /* */ }
    dcRef.current = null;
    try { pcRef.current?.close(); } catch { /* */ }
    pcRef.current = null;
    const local = localStreamRef.current;
    localStreamRef.current = null;
    local?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    latencyRef.current = [];

    // Close sideband SSE
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    sidebandActiveRef.current = false;

    setVoiceDetected(false);
    setSessionWarning(null);
    setConnectionQuality("");
  }, [clearTimers]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    setPostCallData(null);
    setMessages((prev) => {
      saveConversation(prev);
      const finalized = prev.filter((m) => m.final && m.text.trim());
      if (finalized.length > 0 && !postCallFiredRef.current) {
        postCallFiredRef.current = true;
        fetch("/api/tools/post-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            messages: finalized,
            caller_name: callerNameRef.current || undefined,
            caller_email: callerEmailRef.current || undefined,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d?.share_token) {
              setPostCallData({ shareToken: d.share_token, summary: d.summary });
            }
          })
          .catch(() => null);
      }
      return prev;
    });
    teardownConnection();
    setActivities([]);
    setStatus("disconnected");
  }, [teardownConnection, saveConversation]);

  // Handle transcript events from DataChannel (primary) or sideband SSE (redundant)
  const handleTranscriptEvent = useCallback(
    (evt: Record<string, unknown>) => {
      const type = evt.type as string;

      if (type === "conversation.item.input_audio_transcription.delta") {
        const { item_id, content_index, delta } = evt;
        if (typeof item_id !== "string" || typeof content_index !== "number" || typeof delta !== "string") return;
        upsertDelta(`user:${item_id}:${content_index}`, "user", delta);
      } else if (type === "conversation.item.input_audio_transcription.completed") {
        const { item_id, content_index, transcript } = evt;
        if (typeof item_id !== "string" || typeof content_index !== "number" || typeof transcript !== "string") return;
        finalize(`user:${item_id}:${content_index}`, "user", transcript);
      } else if (type === "response.output_audio_transcript.delta") {
        const { item_id, content_index, delta } = evt;
        if (typeof item_id !== "string" || typeof content_index !== "number" || typeof delta !== "string") return;
        upsertDelta(`assistant:${item_id}:${content_index}`, "assistant", delta);
      } else if (type === "response.output_audio_transcript.done") {
        const { item_id, content_index, transcript } = evt;
        if (typeof item_id !== "string" || typeof content_index !== "number" || typeof transcript !== "string") return;
        finalize(`assistant:${item_id}:${content_index}`, "assistant", transcript);
      }
    },
    [upsertDelta, finalize],
  );

  // Client-side tool execution fallback (used when sideband is not active)
  const handleFunctionCallFallback = useCallback(
    async (dc: RTCDataChannel, callId: string, name: string, argsStr: string) => {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(argsStr); } catch { args = {}; }

      const activityId = `${name}_${Date.now()}`;
      const labels = toolLabels[name] || { intent: "Processing", action: name };

      setActivities((prev) => [
        ...prev.slice(-4),
        { id: activityId, intent: labels.intent, action: labels.action, status: "running", timestamp: Date.now() },
      ]);

      let result: string;
      let uiMessage: { id: string; text: string } | undefined;

      try {
        const res = await fetch(`/api/tools/${name === "check_availability" ? "availability" : name === "schedule_meeting" ? "schedule" : name === "send_confirmation_email" ? "send-email" : name === "retrieve_knowledge" ? "rag" : name === "lookup_caller" ? "caller-memory" : name === "research_role" ? "research-role" : name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();

        // Map responses
        if (name === "generate_summary") {
          const company = (args.company as string) || "Unknown";
          const role = (args.role as string) || "General Inquiry";
          const summaryStatus = (args.status as string) || "Exploring";
          const meeting = (args.meeting as string) || "Not Scheduled";
          uiMessage = {
            id: `summary-${Date.now()}`,
            text: `📋 Recap\n\nCompany: ${company}\nRole: ${role}\nStatus: ${summaryStatus}\nMeeting: ${meeting}`,
          };
          result = "Summary displayed. Do NOT read it out loud. Say something brief and wait.";
        } else if (name === "schedule_meeting" && data.success) {
          uiMessage = {
            id: `booking-${Date.now()}`,
            text: `📅 Book your meeting\n\n${data.suggested_time}\n\n${data.booking_link}`,
          };
          result = "Booking link displayed. Do NOT read the URL. Say you dropped a link in the chat.";
        } else if (name === "retrieve_knowledge" || name === "check_availability" || name === "research_role") {
          result = JSON.stringify(data);
        } else {
          result = data.result || data.error || JSON.stringify(data);
        }
      } catch (err) {
        result = `Error executing ${name}: ${err instanceof Error ? err.message : "unknown"}`;
        setActivities((prev) => prev.map((a) => a.id === activityId ? { ...a, status: "error" as const } : a));
      }

      if (uiMessage) {
        setMessages((prev) => [...prev, { id: uiMessage!.id, role: "assistant", text: uiMessage!.text, final: true }]);
      }

      if (dc.readyState === "open") {
        dc.send(JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: result },
        }));
        dc.send(JSON.stringify({ type: "response.create" }));
      }

      setActivities((prev) =>
        prev.map((a) =>
          a.id === activityId && a.status === "running"
            ? { ...a, status: "done" as const, action: labels.action.replace("ing ", "ed ").replace("Checking", "Checked").replace("Searching", "Searched").replace("Looking up", "Found").replace("Sending", "Sent").replace("Booking", "Booked") }
            : a,
        ),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dc.addEventListener("open", () => {
        dc.send(JSON.stringify({ type: "response.create" }));
      });
      dc.addEventListener("message", (e) => {
        if (typeof e.data !== "string") return;
        let evt: unknown;
        try { evt = JSON.parse(e.data); } catch { return; }
        if (!isRecord(evt) || typeof evt.type !== "string") return;

        // Transcript events: always handled on client
        if (
          evt.type === "conversation.item.input_audio_transcription.delta" ||
          evt.type === "conversation.item.input_audio_transcription.completed" ||
          evt.type === "response.output_audio_transcript.delta" ||
          evt.type === "response.output_audio_transcript.done"
        ) {
          handleTranscriptEvent(evt as Record<string, unknown>);
          return;
        }

        // Tool calls: only handle client-side if sideband is NOT active
        if (evt.type === "response.function_call_arguments.done") {
          if (sidebandActiveRef.current) return; // Sideband handles it

          const { call_id, name, arguments: argsStr } = evt;
          if (typeof call_id !== "string" || typeof name !== "string" || typeof argsStr !== "string") return;
          void handleFunctionCallFallback(dc, call_id, name, argsStr);
        }
      });
    },
    [handleTranscriptEvent, handleFunctionCallFallback],
  );

  // Connect the sideband SSE stream
  const connectSideband = useCallback((callId: string) => {
    if (sseRef.current) sseRef.current.close();

    const url = `/api/realtime/sideband?call_id=${encodeURIComponent(callId)}`;
    const sse = new EventSource(url);
    sseRef.current = sse;

    sse.addEventListener("connected", () => {
      sidebandActiveRef.current = true;
    });

    sse.addEventListener("tool_start", (e) => {
      const data = JSON.parse(e.data);
      const labels = toolLabels[data.tool] || { intent: "Processing", action: data.tool };
      setActivities((prev) => [
        ...prev.slice(-4),
        { id: `${data.tool}_${Date.now()}`, intent: labels.intent, action: labels.action, status: "running", timestamp: Date.now() },
      ]);
    });

    sse.addEventListener("tool_done", (e) => {
      const data = JSON.parse(e.data);
      const labels = toolLabels[data.tool] || { intent: "Processing", action: data.tool };
      setActivities((prev) => {
        const running = prev.find((a) => a.intent === labels.intent && a.status === "running");
        if (running) {
          return prev.map((a) =>
            a.id === running.id
              ? { ...a, status: "done" as const, action: labels.action.replace("ing ", "ed ").replace("Checking", "Checked").replace("Searching", "Searched").replace("Looking up", "Found").replace("Sending", "Sent").replace("Booking", "Booked") }
              : a,
          );
        }
        return prev;
      });
    });

    sse.addEventListener("tool_error", (e) => {
      const data = JSON.parse(e.data);
      const labels = toolLabels[data.tool] || { intent: "Processing", action: data.tool };
      setActivities((prev) => {
        const running = prev.find((a) => a.intent === labels.intent && a.status === "running");
        if (running) {
          return prev.map((a) => a.id === running.id ? { ...a, status: "error" as const } : a);
        }
        return prev;
      });
    });

    sse.addEventListener("ui_message", (e) => {
      const data = JSON.parse(e.data);
      setMessages((prev) => [...prev, { id: data.id, role: "assistant", text: data.text, final: true }]);
    });

    sse.addEventListener("agent_switch", (e) => {
      const data = JSON.parse(e.data);
      setActiveAgent(data.agentName);
    });

    sse.addEventListener("error", () => {
      sidebandActiveRef.current = false;
      // Falls back to client-side tool handling automatically
    });

    sse.addEventListener("closed", () => {
      sidebandActiveRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (isReconnect = false) => {
      if (!isReconnect) {
        intentionalDisconnectRef.current = false;
        reconnectAttemptRef.current = 0;
        postCallFiredRef.current = false;
        setMessages([]);
        sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setActiveAgent("Greeter");
      }

      setStatus(isReconnect ? "reconnecting" : "connecting");
      setError(null);
      setSessionWarning(null);

      try {
        // Step 1: Get microphone access + create peer connection
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.addEventListener("connectionstatechange", () => {
          const state = pc.connectionState;
          if (state === "connected") {
            reconnectAttemptRef.current = 0;
            setStatus("connected");
            setConnectionQuality("good");
          }
          if (state === "failed" || state === "disconnected") {
            setConnectionQuality("");
            if (!intentionalDisconnectRef.current) scheduleReconnect();
          }
        });

        pc.addEventListener("iceconnectionstatechange", () => {
          const iceState = pc.iceConnectionState;
          if (iceState === "checking") setConnectionQuality("fair");
          if (iceState === "connected" || iceState === "completed") setConnectionQuality("good");
          if (iceState === "disconnected" || iceState === "failed") setConnectionQuality("poor");
        });

        const statsInterval = setInterval(async () => {
          if (pc.connectionState !== "connected") return;
          try {
            const stats = await pc.getStats();
            stats.forEach((report) => {
              if (report.type === "candidate-pair" && report.state === "succeeded") {
                const rtt = report.currentRoundTripTime;
                if (typeof rtt === "number") {
                  latencyRef.current = [...latencyRef.current.slice(-9), rtt * 1000];
                  const avg = latencyRef.current.reduce((a, b) => a + b, 0) / latencyRef.current.length;
                  if (avg < 150) setConnectionQuality("good");
                  else if (avg < 400) setConnectionQuality("fair");
                  else setConnectionQuality("poor");
                }
              }
            });
          } catch { /* */ }
        }, 3000);
        pingIntervalRef.current = statsInterval;

        pc.ontrack = (e) => {
          const el = audioRef.current;
          if (!el) return;
          el.srcObject = e.streams[0];
          void el.play().catch(() => null);
        };

        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = localStream;
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        setupDataChannel(dc);

        // Step 2: Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Step 3: Send to our server (proxied SDP exchange)
        const connectRes = await fetch("/api/realtime/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caller_name: callerNameRef.current || undefined,
            caller_email: callerEmailRef.current || undefined,
            sdp_offer: offer.sdp,
          }),
        });

        if (!connectRes.ok) {
          const text = await connectRes.text();
          throw new Error(text || "Failed to establish connection");
        }

        const { sdp_answer, call_id, expires_at } = await connectRes.json();
        callIdRef.current = call_id;
        tokenExpiresAtRef.current = (expires_at || 0) * 1000;

        // Step 4: Set remote description
        await pc.setRemoteDescription({ type: "answer", sdp: sdp_answer });
        setStatus("connected");

        // Step 5: Connect sideband for server-side tool handling
        if (call_id) {
          connectSideband(call_id);
        }

        scheduleTokenRefresh();
      } catch (err) {
        teardownConnection();
        if (!intentionalDisconnectRef.current && isReconnect) {
          scheduleReconnect();
        } else {
          setStatus("error");
          setError(toFriendlyError(err instanceof Error ? err.message : "Unknown error"));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) return;
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus("error");
      setError("Connection was lost. Tap Connect to start a new conversation.");
      return;
    }
    const attempt = reconnectAttemptRef.current;
    reconnectAttemptRef.current = attempt + 1;
    const delayMs = Math.min(1000 * Math.pow(2, attempt), 16000);
    setStatus("reconnecting");
    setError(`Reconnecting in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
    teardownConnection();
    reconnectTimerRef.current = setTimeout(() => { void connect(true); }, delayMs);
  }, [teardownConnection, connect]);

  const scheduleTokenRefresh = useCallback(() => {
    if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current);
    const expiresAt = tokenExpiresAtRef.current;
    if (!expiresAt) return;
    const msUntilExpiry = expiresAt - Date.now();
    const refreshAt = msUntilExpiry - TOKEN_REFRESH_BUFFER_MS;
    if (refreshAt <= 0) {
      setSessionWarning("Refreshing connection — you can keep talking.");
      teardownConnection();
      void connect(true);
      return;
    }
    const warnAt = refreshAt - 30_000;
    if (warnAt > 0) {
      tokenTimerRef.current = setTimeout(() => {
        setSessionWarning("Connection refreshing soon — no action needed.");
        tokenTimerRef.current = setTimeout(() => {
          setSessionWarning("Refreshing connection — one moment.");
          teardownConnection();
          void connect(true);
        }, 30_000);
      }, warnAt);
    } else {
      tokenTimerRef.current = setTimeout(() => {
        setSessionWarning("Refreshing connection — one moment.");
        teardownConnection();
        void connect(true);
      }, refreshAt);
    }
  }, [teardownConnection, connect]);

  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true;
      teardownConnection();
    };
  }, [teardownConnection]);

  const { userMessages, assistantMessages } = useMemo(() => {
    const u: TranscriptMessage[] = [];
    const a: TranscriptMessage[] = [];
    for (const m of messages) {
      if (m.role === "user") u.push(m);
      else a.push(m);
    }
    return { userMessages: u, assistantMessages: a };
  }, [messages]);

  useEffect(() => {
    const finalized = messages.filter((m) => m.final);
    if (finalized.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveConversation(messages); }, 3000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, saveConversation]);

  const cleanText = (text: string): React.ReactNode => {
    let cleaned = text.replace(/\u2014/g, ", ").replace(/\u2013/g, ", ").replace(/, ,/g, ",");
    cleaned = cleaned.replace(/[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g, "").trim();
    const final = cleaned || text;
    const lines = final.split("\n");
    const elements: React.ReactNode[] = [];
    const splitPattern = /(https?:\/\/[^\s,)]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|dev|tech|app|co|me|ai)(?:\/[^\s,)]*)?)/g;
    const testPattern = /^(https?:\/\/[^\s,)]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|dev|tech|app|co|me|ai)(?:\/[^\s,)]*)?)$/;
    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) elements.push(<br key={`br-${lineIdx}`} />);
      const parts = line.split(splitPattern);
      parts.forEach((part, partIdx) => {
        if (testPattern.test(part)) {
          const href = part.startsWith("http") ? part : `https://${part}`;
          elements.push(
            <a key={`${lineIdx}-${partIdx}`} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300 break-all">{part}</a>,
          );
        } else if (part) {
          elements.push(<span key={`${lineIdx}-${partIdx}`}>{part}</span>);
        }
      });
    });
    return elements;
  };

  const orbHue = useMemo(() => {
    if (status === "connecting" || status === "reconnecting") return 280;
    if (status === "error") return 0;
    if (status === "connected") return voiceDetected ? 205 : 235;
    return 240;
  }, [status, voiceDetected]);

  const isLoading = status === "connecting" || status === "reconnecting";
  const isActive = status === "connected";

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <audio ref={audioRef} autoPlay className="hidden" />

      <div className="flex items-center justify-end gap-3 px-4 py-3 sm:px-6">
        <AuthHeader />
        <Button
          onClick={isActive || status === "reconnecting" ? disconnect : () => void connect()}
          disabled={status === "connecting"}
          variant={isActive ? "destructive" : "default"}
          className="rounded-full px-5 text-sm"
        >
          {isActive ? (<><MicOff className="mr-2 h-4 w-4" />Disconnect</>) : (<><Mic className="mr-2 h-4 w-4" />{isLoading ? "Connecting..." : "Connect"}</>)}
        </Button>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 sm:mx-6">
          {toFriendlyError(error)}
          <Button variant="ghost" size="sm" className="mt-2 text-red-200 hover:text-white" onClick={() => { setError(null); void connect(); }}>
            Try again
          </Button>
        </div>
      )}
      {sessionWarning && (
        <div className="mx-4 mb-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200 sm:mx-6">{sessionWarning}</div>
      )}

      {/* Post-call: Your transcript is ready */}
      {status === "disconnected" && postCallData && (
        <div className="mx-4 mb-4 rounded-2xl border border-white/20 bg-white/5 p-6 sm:mx-6">
          <h3 className="text-lg font-semibold text-white">Your transcript is ready</h3>
          <p className="mt-1 text-sm text-white/60">Share the link or download as PDF.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={async () => {
                const url = `${APP_URL}/call/${postCallData.shareToken}`;
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => {
                const doc = new jsPDF();
                let y = 20;
                doc.setFontSize(14);
                doc.text("Conversation with Ariv's AI", 20, y);
                y += 15;
                doc.setFontSize(10);
                for (const m of messages) {
                  const label = m.role === "user" ? "You" : "Ariv's AI";
                  const text = `${label}: ${m.text}`;
                  const lines = doc.splitTextToSize(text, 170);
                  doc.text(lines, 20, y);
                  y += lines.length * 6 + 4;
                  if (y > 270) { doc.addPage(); y = 20; }
                }
                doc.save("ariv-conversation.pdf");
              }}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <a
              href={`/call/${postCallData.shareToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              View full transcript
            </a>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 text-white/60 hover:text-white"
            onClick={() => {
              setPostCallData(null);
              setError(null);
              void connect();
            }}
          >
            Start another conversation
          </Button>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 lg:px-6">
        <div className="flex w-full max-w-6xl items-start justify-center gap-12">
          {/* Left: User transcript */}
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="text-xs font-medium uppercase tracking-widest text-white/40">You</div>
            <div className="mt-4 max-h-[65vh] space-y-5 overflow-auto pr-2">
              {isLoading ? (
                <div className="space-y-3"><SkeletonLine className="h-3 w-3/4" /><SkeletonLine className="h-3 w-1/2" /></div>
              ) : userMessages.length === 0 ? (
                <div className="text-sm text-white/30">Your words will appear here.</div>
              ) : (
                userMessages.map((m) => (
                  <div key={m.id} className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}>{cleanText(m.text)}</div>
                ))
              )}
            </div>
          </div>

          {/* Center: Orb */}
          <div className="flex flex-col items-center">
            <div className="relative h-64 w-64 sm:h-80 sm:w-80 lg:h-[28rem] lg:w-[28rem]">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500/15 via-purple-500/15 to-fuchsia-500/15 blur-3xl" />
              <div className="relative h-full w-full overflow-hidden rounded-full">
                <VoicePoweredOrb
                  enableVoiceControl={isActive}
                  hue={orbHue}
                  onVoiceDetected={handleVoiceDetected}
                  mediaStream={localStreamRef.current}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/40 sm:mt-4">
              <span>
                {isActive ? voiceDetected ? "Listening..." : "Ready" : isLoading ? "Connecting..." : ""}
              </span>
              {isActive && connectionQuality && (
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${connectionQuality === "good" ? "bg-green-400" : connectionQuality === "fair" ? "bg-yellow-400" : "bg-red-400 animate-pulse"}`} />
                  <span className="text-[10px] text-white/25">{connectionQuality === "good" ? "Strong" : connectionQuality === "fair" ? "Fair" : "Weak"}</span>
                </span>
              )}
              {isActive && sidebandActiveRef.current && (
                <span className="text-[10px] text-emerald-400/40">{activeAgent}</span>
              )}
            </div>

            {activities.length > 0 && (
              <div className="mt-4 w-full max-w-xs px-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">System</div>
                <div className="space-y-1">
                  {activities.slice(-3).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      {a.status === "running" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                        : a.status === "done" ? <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                        : <span className="h-1.5 w-1.5 rounded-full bg-red-400" />}
                      <span className="font-medium text-white/40">{a.intent}</span>
                      <span className="text-white/25">{a.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Assistant responses */}
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="text-xs font-medium uppercase tracking-widest text-white/40">Ariv&apos;s AI</div>
            <div className="mt-4 max-h-[65vh] space-y-5 overflow-auto pr-2">
              {isLoading ? (
                <div className="space-y-3"><SkeletonLine className="h-3 w-3/4" /><SkeletonLine className="h-3 w-1/2" /></div>
              ) : assistantMessages.length === 0 ? (
                <div className="text-sm text-white/30">{isActive ? "Ask anything about Ariv." : ""}</div>
              ) : (
                assistantMessages.map((m) => (
                  <div key={m.id} className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}>{cleanText(m.text)}</div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Mobile: transcripts below orb — larger scroll area, auto-scroll */}
        <div ref={mobileTranscriptRef} className="mt-6 w-full max-w-md space-y-3 lg:hidden">
          {(userMessages.length > 0 || assistantMessages.length > 0) && (
            <div className="max-h-[38vh] space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-medium uppercase tracking-widest text-white/40">Conversation</div>
              <div className="mt-2 space-y-3">
                {userMessages.map((m) => (
                  <div key={m.id} className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}>{cleanText(m.text)}</div>
                ))}
              </div>
            </div>
          )}
          {assistantMessages.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-white/40">Ariv&apos;s AI</div>
              <div className="mt-2 max-h-[20vh] space-y-3 overflow-auto">
                {assistantMessages.map((m) => (
                  <div key={m.id} className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}>{cleanText(m.text)}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
