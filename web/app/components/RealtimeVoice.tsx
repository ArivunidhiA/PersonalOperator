"use client";

import { Button } from "@/components/ui/button";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser as useClerkUser } from "@clerk/nextjs";
import { AuthHeader } from "./AuthHeader";

type Role = "user" | "assistant";

type TranscriptMessage = {
  id: string;
  role: Role;
  text: string;
  final: boolean;
};

type TokenResponse = {
  value: string;
  expires_at: number;
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

  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);

  const tokenExpiresAtRef = useRef<number>(0);
  const tokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionIdRef = useRef<string>("");
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
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor" | "">("")
  const latencyRef = useRef<number[]>([]);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (index === -1) {
        return [...prev, { id, role, text: delta, final: false }];
      }
      const next = [...prev];
      next[index] = { ...next[index], text: next[index].text + delta };
      return next;
    });
  }, []);

  const finalize = useCallback(
    (id: string, role: Role, transcript: string) => {
      setMessages((prev) => {
        const index = prev.findIndex((m) => m.id === id);
        if (index === -1) {
          return [...prev, { id, role, text: transcript, final: true }];
        }
        const next = [...prev];
        next[index] = { ...next[index], text: transcript, final: true };
        return next;
      });
    },
    []
  );

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
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (tokenTimerRef.current) {
      clearTimeout(tokenTimerRef.current);
      tokenTimerRef.current = null;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const teardownConnection = useCallback(() => {
    clearTimers();

    try {
      dcRef.current?.close();
    } catch {
    }
    dcRef.current = null;

    try {
      pcRef.current?.close();
    } catch {
    }
    pcRef.current = null;

    const local = localStreamRef.current;
    localStreamRef.current = null;
    local?.getTracks().forEach((t) => t.stop());

    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    latencyRef.current = [];

    setVoiceDetected(false);
    setSessionWarning(null);
    setConnectionQuality("");
  }, [clearTimers]);

  const triggerPostCall = useCallback(
    (msgs: TranscriptMessage[]) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      if (postCallFiredRef.current) return;
      postCallFiredRef.current = true;
      const finalized = msgs.filter((m) => m.final && m.text.trim());
      if (finalized.length === 0) return;

      void fetch("/api/tools/post-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          messages: finalized,
          caller_name: callerNameRef.current || undefined,
          caller_email: callerEmailRef.current || undefined,
        }),
      }).catch(() => null);
    },
    []
  );

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    setMessages((prev) => {
      saveConversation(prev);
      triggerPostCall(prev);
      return prev;
    });
    teardownConnection();
    setActivities([]);
    setStatus("disconnected");
  }, [teardownConnection, saveConversation, triggerPostCall]);

  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dc.addEventListener("message", (e) => {
        if (typeof e.data !== "string") return;
        let evt: unknown;
        try {
          evt = JSON.parse(e.data);
        } catch {
          return;
        }

        if (!isRecord(evt) || typeof evt.type !== "string") return;

        if (evt.type === "conversation.item.input_audio_transcription.delta") {
          const { item_id, content_index, delta } = evt;
          if (
            typeof item_id !== "string" ||
            typeof content_index !== "number" ||
            typeof delta !== "string"
          )
            return;
          upsertDelta(`user:${item_id}:${content_index}`, "user", delta);
          return;
        }

        if (
          evt.type ===
          "conversation.item.input_audio_transcription.completed"
        ) {
          const { item_id, content_index, transcript } = evt;
          if (
            typeof item_id !== "string" ||
            typeof content_index !== "number" ||
            typeof transcript !== "string"
          )
            return;
          finalize(
            `user:${item_id}:${content_index}`,
            "user",
            transcript
          );
          return;
        }

        if (evt.type === "response.output_audio_transcript.delta") {
          const { item_id, content_index, delta } = evt;
          if (
            typeof item_id !== "string" ||
            typeof content_index !== "number" ||
            typeof delta !== "string"
          )
            return;
          upsertDelta(
            `assistant:${item_id}:${content_index}`,
            "assistant",
            delta
          );
          return;
        }

        if (evt.type === "response.output_audio_transcript.done") {
          const { item_id, content_index, transcript } = evt;
          if (
            typeof item_id !== "string" ||
            typeof content_index !== "number" ||
            typeof transcript !== "string"
          )
            return;
          finalize(
            `assistant:${item_id}:${content_index}`,
            "assistant",
            transcript
          );
        }

        if (evt.type === "response.function_call_arguments.done") {
          const { call_id, name, arguments: argsStr } = evt;
          if (
            typeof call_id !== "string" ||
            typeof name !== "string" ||
            typeof argsStr !== "string"
          )
            return;

          void handleFunctionCall(dc, call_id, name, argsStr);
        }
      });
    },
    [upsertDelta, finalize]
  );

  const toolLabels: Record<string, { intent: string; action: string }> = {
    check_availability: { intent: "Scheduling", action: "Checking calendar" },
    schedule_meeting: { intent: "Scheduling", action: "Booking meeting" },
    send_confirmation_email: { intent: "Email", action: "Sending confirmation" },
    retrieve_knowledge: { intent: "Knowledge", action: "Searching knowledge base" },
    lookup_caller: { intent: "Memory", action: "Looking up caller" },
    research_role: { intent: "Role Research", action: "Researching role fit" },
    generate_summary: { intent: "Summary", action: "Generating recap" },
  };

  const handleFunctionCall = async (
    dc: RTCDataChannel,
    callId: string,
    name: string,
    argsStr: string
  ) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsStr);
    } catch {
      args = {};
    }

    const activityId = `${name}_${Date.now()}`;
    const labels = toolLabels[name] || { intent: "Processing", action: name };

    setActivities((prev) => [
      ...prev.slice(-4),
      { id: activityId, intent: labels.intent, action: labels.action, status: "running", timestamp: Date.now() },
    ]);

    let result: string;

    try {
      if (name === "check_availability") {
        const res = await fetch("/api/tools/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start_date: args.start_date }),
        });
        const data = await res.json();
        const schedulingUrl = data.scheduling_url || "https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat";
        if (data.slots && data.slots.length > 0) {
          const formatted = data.slots
            .map((s: string) =>
              new Date(s).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })
            )
            .join(", ");
          result = `Available slots in the next 7 days: ${formatted}. Booking link: ${schedulingUrl}`;
        } else {
          result = `${data.note || "Ariv's calendar is generally open."} Direct booking link: ${schedulingUrl} — share this with the caller so they can pick a time that works.`;
        }
      } else if (name === "schedule_meeting") {
        const res = await fetch("/api/tools/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (data.success) {
          result = `Meeting confirmed! ${data.message}`;
          if (data.cancel_url) result += ` Cancel link: ${data.cancel_url}`;
          if (data.reschedule_url) result += ` Reschedule link: ${data.reschedule_url}`;
        } else {
          result = `Booking failed: ${data.error || "unknown error"}. ${data.recovery || "Try a different time."}`;
          if (data.scheduling_url) result += ` Fallback booking link: ${data.scheduling_url}`;
        }
      } else if (name === "send_confirmation_email") {
        const res = await fetch("/api/tools/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: args.to,
            subject: args.subject,
            html: `<div style="font-family: sans-serif; line-height: 1.6;">${String(args.body || "").replace(/\n/g, "<br>")}</div>`,
          }),
        });
        const data = await res.json();
        result = data.success
          ? "Email sent successfully."
          : `Failed to send email: ${data.error || "unknown error"}`;
      } else if (name === "retrieve_knowledge") {
        const res = await fetch("/api/tools/rag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: args.query }),
        });
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          result = data.results
            .map(
              (r: { content: string; similarity: number }) =>
                `[Relevance: ${(r.similarity * 100).toFixed(0)}%] ${r.content}`
            )
            .join("\n\n");
        } else {
          result =
            "No specific information found for that query. Answer based on what you already know about Ariv, or suggest they ask Ariv directly.";
        }
      } else if (name === "generate_summary") {
        const company = (args.company as string) || "Unknown";
        const role = (args.role as string) || "General Inquiry";
        const summaryStatus = (args.status as string) || "Exploring";
        const meeting = (args.meeting as string) || "Not Scheduled";
        result = `Recruiter Summary:\n- Company: ${company}\n- Role: ${role}\n- Status: ${summaryStatus}\n- Meeting: ${meeting}\n\nRead this summary to the caller naturally. For example: "So here's your recap. Company: ${company}. Role: ${role}. Status: ${summaryStatus}. Meeting: ${meeting}. It was great chatting with you!"`;
      } else if (name === "research_role") {
        const res = await fetch("/api/tools/research-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: args.company, role: args.role }),
        });
        const data = await res.json();
        if (data.lead_with) {
          result = `ROLE RESEARCH RESULTS for ${data.role} at ${data.company}:\n`;
          result += `\nCompany: ${data.company_summary}`;
          result += `\nWhat this role ACTUALLY needs: ${(data.role_core_needs || []).join(", ")}`;
          result += `\nKey traits they're looking for: ${(data.key_traits || []).join(", ")}`;
          result += `\nPitch order (lead with first): ${(data.pitch_order || []).join(" → ")}`;
          result += `\n\nLEAD WITH THIS: ${data.lead_with}`;
          result += `\n\nSUPPORTING POINTS:\n${(data.supporting_points || []).map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}`;
          result += `\n\nCONNECTION TO COMPANY: ${data.connection}`;
          result += `\n\nAVOID leading with: ${data.avoid}`;
          if (data.relevant_experiences?.length) {
            result += `\n\nRELEVANT EXPERIENCE DETAILS:\n${data.relevant_experiences.join("\n\n")}`;
          }
        } else {
          result = `Could not research this role. Give a general pitch about Ariv's technical skills and production experience.`;
        }
      } else if (name === "lookup_caller") {
        const res = await fetch("/api/tools/caller-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: args.email }),
        });
        const data = await res.json();
        if (data.found) {
          const c = data.caller;
          let memory = `Returning caller! ${c.name || "Unknown name"} (${c.email}).`;
          if (c.company) memory += ` Works at ${c.company}.`;
          memory += ` This is call #${c.call_count}.`;
          if (c.last_topics?.length) {
            memory += ` Last time they asked about: ${c.last_topics.join(", ")}.`;
          }
          if (c.last_summary) {
            memory += ` Previous call summary: ${c.last_summary}`;
          }
          if (data.recent_calls?.length) {
            memory += ` They've had ${data.recent_calls.length} recent call(s).`;
          }
          result = memory;
        } else {
          result = "First-time caller — no previous history found.";
        }
      } else {
        result = `Unknown function: ${name}`;
      }
    } catch (err) {
      result = `Error executing ${name}: ${err instanceof Error ? err.message : "unknown error"}`;
      setActivities((prev) =>
        prev.map((a) => (a.id === activityId ? { ...a, status: "error" as const } : a))
      );
    }

    if (dc.readyState === "open") {
      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: result,
          },
        })
      );

      dc.send(
        JSON.stringify({
          type: "response.create",
        })
      );
    }

    setActivities((prev) =>
      prev.map((a) =>
        a.id === activityId && a.status === "running"
          ? { ...a, status: "done" as const, action: labels.action.replace("ing ", "ed ").replace("Checking", "Checked").replace("Searching", "Searched").replace("Looking up", "Found").replace("Sending", "Sent").replace("Booking", "Booked") }
          : a
      )
    );
  };

  const connect = useCallback(
    async (isReconnect = false) => {
      if (!isReconnect) {
        intentionalDisconnectRef.current = false;
        reconnectAttemptRef.current = 0;
        postCallFiredRef.current = false;
        setMessages([]);
      }

      if (!isReconnect) {
        sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }

      setStatus(isReconnect ? "reconnecting" : "connecting");
      setError(null);
      setSessionWarning(null);

      try {
        const tokenRes = await fetch("/api/realtime/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caller_name: callerNameRef.current || undefined,
            caller_email: callerEmailRef.current || undefined,
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          throw new Error(text || "Failed to mint Realtime token");
        }

        const tokenData = (await tokenRes.json()) as TokenResponse;
        if (!tokenData?.value) {
          throw new Error("Token response missing value");
        }

        tokenExpiresAtRef.current = tokenData.expires_at * 1000;

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
            if (!intentionalDisconnectRef.current) {
              scheduleReconnect();
            }
          }
        });

        pc.addEventListener("iceconnectionstatechange", () => {
          const iceState = pc.iceConnectionState;
          if (iceState === "checking") setConnectionQuality("fair");
          if (iceState === "connected" || iceState === "completed") setConnectionQuality("good");
          if (iceState === "disconnected") setConnectionQuality("poor");
          if (iceState === "failed") setConnectionQuality("poor");
        });

        // Monitor connection stats for quality
        const statsInterval = setInterval(async () => {
          if (pc.connectionState !== "connected") return;
          try {
            const stats = await pc.getStats();
            stats.forEach((report) => {
              if (report.type === "candidate-pair" && report.state === "succeeded") {
                const rtt = report.currentRoundTripTime;
                if (typeof rtt === "number") {
                  latencyRef.current = [...latencyRef.current.slice(-9), rtt * 1000];
                  const avgLatency = latencyRef.current.reduce((a, b) => a + b, 0) / latencyRef.current.length;
                  if (avgLatency < 150) setConnectionQuality("good");
                  else if (avgLatency < 400) setConnectionQuality("fair");
                  else setConnectionQuality("poor");
                }
              }
            });
          } catch {}
        }, 3000);
        pingIntervalRef.current = statsInterval;

        pc.ontrack = (e) => {
          const el = audioRef.current;
          if (!el) return;
          el.srcObject = e.streams[0];
          void el.play().catch(() => null);
        };

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        localStreamRef.current = localStream;

        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        setupDataChannel(dc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpRes = await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {
            method: "POST",
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${tokenData.value}`,
              "Content-Type": "application/sdp",
            },
          }
        );

        if (!sdpRes.ok) {
          const text = await sdpRes.text();
          throw new Error(
            text || "Failed to establish Realtime WebRTC session"
          );
        }

        const answer = {
          type: "answer" as const,
          sdp: await sdpRes.text(),
        };

        await pc.setRemoteDescription(answer);

        setStatus("connected");

        scheduleTokenRefresh();
      } catch (err) {
        teardownConnection();
        if (!intentionalDisconnectRef.current && isReconnect) {
          scheduleReconnect();
        } else {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) return;
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus("error");
      setError("Connection lost. Max reconnection attempts reached.");
      return;
    }

    const attempt = reconnectAttemptRef.current;
    reconnectAttemptRef.current = attempt + 1;
    const delayMs = Math.min(1000 * Math.pow(2, attempt), 16000);

    setStatus("reconnecting");
    setError(`Reconnecting in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);

    teardownConnection();

    reconnectTimerRef.current = setTimeout(() => {
      void connect(true);
    }, delayMs);
  }, [teardownConnection, connect]);

  const scheduleTokenRefresh = useCallback(() => {
    if (tokenTimerRef.current) {
      clearTimeout(tokenTimerRef.current);
    }

    const expiresAt = tokenExpiresAtRef.current;
    if (!expiresAt) return;

    const msUntilExpiry = expiresAt - Date.now();
    const refreshAt = msUntilExpiry - TOKEN_REFRESH_BUFFER_MS;

    if (refreshAt <= 0) {
      setSessionWarning("Session expiring soon. Reconnecting...");
      teardownConnection();
      void connect(true);
      return;
    }

    const warnAt = refreshAt - 30_000;
    if (warnAt > 0) {
      tokenTimerRef.current = setTimeout(() => {
        setSessionWarning("Session expires in ~1 minute.");
        tokenTimerRef.current = setTimeout(() => {
          setSessionWarning("Refreshing session...");
          teardownConnection();
          void connect(true);
        }, 30_000);
      }, warnAt);
    } else {
      tokenTimerRef.current = setTimeout(() => {
        setSessionWarning("Refreshing session...");
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
    const user: TranscriptMessage[] = [];
    const assistant: TranscriptMessage[] = [];

    for (const m of messages) {
      if (m.role === "user") user.push(m);
      else assistant.push(m);
    }

    return { userMessages: user, assistantMessages: assistant };
  }, [messages]);

  useEffect(() => {
    const finalized = messages.filter((m) => m.final);
    if (finalized.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveConversation(messages);
    }, 3000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, saveConversation]);

  const cleanText = (text: string) => {
    // Strip em/en dashes
    let cleaned = text.replace(/\u2014/g, ", ").replace(/\u2013/g, ", ").replace(/, ,/g, ",");
    // Strip non-Latin characters (CJK, Korean, etc.) that appear from transcription hallucinations
    cleaned = cleaned.replace(/[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g, "").trim();
    return cleaned || text;
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

      {/* Top bar: auth + connect */}
      <div className="flex items-center justify-end gap-3 px-4 py-3 sm:px-6">
        <AuthHeader />
        <Button
          onClick={
            isActive || status === "reconnecting"
              ? disconnect
              : () => void connect()
          }
          disabled={status === "connecting"}
          variant={isActive ? "destructive" : "default"}
          className="rounded-full px-5 text-sm"
        >
          {isActive ? (
            <>
              <MicOff className="mr-2 h-4 w-4" />
              Disconnect
            </>
          ) : (
            <>
              <Mic className="mr-2 h-4 w-4" />
              {isLoading ? "Connecting..." : "Connect"}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 sm:mx-6">
          {error}
        </div>
      )}

      {sessionWarning && (
        <div className="mx-4 mb-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200 sm:mx-6">
          {sessionWarning}
        </div>
      )}

      {/* Main content: orb centered, transcripts on sides */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 lg:px-6">
        <div className="flex w-full max-w-6xl items-start justify-center gap-12">
          {/* Left: User transcript (desktop only) */}
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="text-xs font-medium uppercase tracking-widest text-white/40">
              You
            </div>
            <div className="mt-4 max-h-[65vh] space-y-5 overflow-auto pr-2">
              {isLoading ? (
                <div className="space-y-3">
                  <SkeletonLine className="h-3 w-3/4" />
                  <SkeletonLine className="h-3 w-1/2" />
                </div>
              ) : userMessages.length === 0 ? (
                <div className="text-sm text-white/30">
                  Your words will appear here.
                </div>
              ) : (
                userMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}
                  >
                    {cleanText(m.text)}
                  </div>
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
                {isActive
                  ? voiceDetected
                    ? "Listening..."
                    : "Ready"
                  : isLoading
                    ? "Connecting..."
                    : ""}
              </span>
              {isActive && connectionQuality && (
                <span className="flex items-center gap-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      connectionQuality === "good"
                        ? "bg-green-400"
                        : connectionQuality === "fair"
                          ? "bg-yellow-400"
                          : "bg-red-400 animate-pulse"
                    }`}
                  />
                  <span className="text-[10px] text-white/25">
                    {connectionQuality === "good"
                      ? "Strong"
                      : connectionQuality === "fair"
                        ? "Fair"
                        : "Weak"}
                  </span>
                </span>
              )}
            </div>

            {activities.length > 0 && (
              <div className="mt-4 w-full max-w-xs px-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                  System
                </div>
                <div className="space-y-1">
                  {activities.slice(-3).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      {a.status === "running" ? (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                      ) : a.status === "done" ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      )}
                      <span className="font-medium text-white/40">{a.intent}</span>
                      <span className="text-white/25">{a.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Assistant responses — plain text, no boxes */}
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="text-xs font-medium uppercase tracking-widest text-white/40">
              Ariv&apos;s AI
            </div>
            <div className="mt-4 max-h-[65vh] space-y-5 overflow-auto pr-2">
              {isLoading ? (
                <div className="space-y-3">
                  <SkeletonLine className="h-3 w-3/4" />
                  <SkeletonLine className="h-3 w-1/2" />
                </div>
              ) : assistantMessages.length === 0 ? (
                <div className="text-sm text-white/30">
                  {isActive ? "Ask anything about Ariv." : ""}
                </div>
              ) : (
                assistantMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}
                  >
                    {cleanText(m.text)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Mobile: transcripts below orb */}
        <div className="mt-6 w-full max-w-sm space-y-4 lg:hidden">
          {userMessages.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-white/40">
                You
              </div>
              <div className="mt-2 max-h-[20vh] space-y-3 overflow-auto">
                {userMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}
                  >
                    {cleanText(m.text)}
                  </div>
                ))}
              </div>
            </div>
          )}
          {assistantMessages.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-white/40">
                Ariv&apos;s AI
              </div>
              <div className="mt-2 max-h-[20vh] space-y-3 overflow-auto">
                {assistantMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm leading-6 ${m.final ? "text-white/80" : "text-white/40"}`}
                  >
                    {cleanText(m.text)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
