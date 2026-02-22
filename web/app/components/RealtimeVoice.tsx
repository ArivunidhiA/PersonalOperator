"use client";

import {
  ChatBubble,
  ChatBubbleAction,
  ChatBubbleActionWrapper,
  ChatBubbleAvatar,
  ChatBubbleMessage,
} from "@/components/ui/chat-bubble";
import { Button } from "@/components/ui/button";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { Copy, Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function RealtimeVoice() {
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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error" | "reconnecting"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);

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

    setVoiceDetected(false);
    setSessionWarning(null);
  }, [clearTimers]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    setMessages((prev) => {
      saveConversation(prev);
      return prev;
    });
    teardownConnection();
    setStatus("disconnected");
  }, [teardownConnection, saveConversation]);

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
      });
    },
    [upsertDelta, finalize]
  );

  const connect = useCallback(
    async (isReconnect = false) => {
      if (!isReconnect) {
        intentionalDisconnectRef.current = false;
        reconnectAttemptRef.current = 0;
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
          }
          if (state === "failed" || state === "disconnected") {
            if (!intentionalDisconnectRef.current) {
              scheduleReconnect();
            }
          }
        });

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

  const orbHue = useMemo(() => {
    if (status === "connecting" || status === "reconnecting") return 280;
    if (status === "error") return 0;
    if (status === "connected") return voiceDetected ? 205 : 235;
    return 240;
  }, [status, voiceDetected]);

  const isLoading = status === "connecting" || status === "reconnecting";
  const isActive = status === "connected";

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:gap-10 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Ariv&apos;s AI Operator
              </h1>
              <p className="mt-1 text-sm text-white/60 sm:mt-2">
                Live Agent Execution
              </p>
            </div>

            <div className="flex items-center gap-3">
              <AuthHeader />
              <Button
                onClick={
                  isActive || status === "reconnecting"
                    ? disconnect
                    : () => void connect()
                }
                disabled={status === "connecting"}
                variant={isActive ? "destructive" : "default"}
                className="rounded-full px-6"
              >
                {isActive ? (
                  <>
                    <MicOff className="mr-2 h-4 w-4" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" />
                    {status === "reconnecting" ? "Cancel" : "Connect"}
                  </>
                )}
              </Button>

              <div className="hidden text-sm text-white/60 sm:block">
                {status}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {sessionWarning && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              {sessionWarning}
            </div>
          )}
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />

        {/* Mobile: stacked, Desktop: 3-column */}
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:gap-12">
          {/* Center orb — shown first on mobile for visual hierarchy */}
          <div className="order-1 lg:order-2 lg:col-span-4">
            <div className="flex flex-col items-center justify-center">
              <div className="relative h-48 w-48 sm:h-80 sm:w-80 lg:h-96 lg:w-96">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-blue-500/20 via-purple-500/20 to-fuchsia-500/20 blur-2xl" />
                <div className="relative h-full w-full rounded-3xl overflow-hidden">
                  <VoicePoweredOrb
                    enableVoiceControl={isActive}
                    hue={orbHue}
                    onVoiceDetected={setVoiceDetected}
                    mediaStream={localStreamRef.current}
                  />
                </div>
              </div>

              <div className="mt-4 text-center text-sm text-white/60 sm:mt-6">
                {isActive
                  ? voiceDetected
                    ? "Listening"
                    : "Ready"
                  : isLoading
                    ? "Connecting..."
                    : "Press Connect to start"}
              </div>
            </div>
          </div>

          {/* Left: User transcript */}
          <div className="order-2 lg:order-1 lg:col-span-4">
            <div className="text-xs font-medium uppercase tracking-widest text-white/50">
              You
            </div>

            <div className="mt-4 max-h-[40vh] space-y-6 overflow-auto pr-2 sm:mt-8 sm:space-y-8 lg:max-h-[55vh]">
              {isLoading ? (
                <div className="space-y-4">
                  <SkeletonLine className="h-3 w-3/4" />
                  <SkeletonLine className="h-3 w-1/2" />
                  <SkeletonLine className="h-3 w-2/3" />
                </div>
              ) : userMessages.length === 0 ? (
                <div className="text-sm text-white/40">
                  Press Connect, then start talking.
                </div>
              ) : (
                userMessages.map((m) => (
                  <div key={m.id} className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-widest text-white/40">
                      You
                    </div>
                    <div
                      className={`text-base leading-7 sm:text-lg ${m.final ? "" : "opacity-60"}`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: System intelligence + assistant */}
          <div className="order-3 lg:col-span-4">
            <div className="text-xs font-medium uppercase tracking-widest text-white/50">
              System intelligence
            </div>

            <div className="mt-4 space-y-2 font-mono text-xs text-white/70 sm:mt-6">
              <div>→ Status: {status}</div>
              <div>→ Voice: {voiceDetected ? "detected" : "quiet"}</div>
              {reconnectAttemptRef.current > 0 && (
                <div>→ Reconnect attempt: {reconnectAttemptRef.current}</div>
              )}
              {error && <div className="text-red-300">→ Error</div>}
            </div>

            <div className="mt-6 max-h-[40vh] space-y-4 overflow-auto pr-2 sm:mt-8 sm:space-y-5 lg:max-h-[55vh]">
              {isLoading ? (
                <div className="space-y-4">
                  <SkeletonLine className="h-12 w-full rounded-lg" />
                  <SkeletonLine className="h-12 w-5/6 rounded-lg" />
                </div>
              ) : assistantMessages.length === 0 ? (
                <div className="text-sm text-white/40">
                  Assistant responses will appear here.
                </div>
              ) : (
                assistantMessages.map((m) => (
                  <ChatBubble
                    key={m.id}
                    variant="received"
                    className="items-start"
                  >
                    <ChatBubbleAvatar fallback="AI" />
                    <div className="min-w-0 flex-1">
                      <ChatBubbleMessage
                        className={`font-mono text-sm leading-6 ${m.final ? "" : "opacity-70"}`}
                      >
                        {m.text}
                      </ChatBubbleMessage>

                      <ChatBubbleActionWrapper>
                        <ChatBubbleAction
                          icon={<Copy className="h-3 w-3" />}
                          onClick={() => {
                            void navigator.clipboard.writeText(m.text);
                          }}
                        />
                      </ChatBubbleActionWrapper>
                    </div>
                  </ChatBubble>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
