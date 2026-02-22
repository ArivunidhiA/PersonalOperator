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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function RealtimeVoice() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [voiceDetected, setVoiceDetected] = useState(false);

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

  const disconnect = useCallback(() => {
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

    setStatus("disconnected");
    setVoiceDetected(false);
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setMessages([]);

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

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.addEventListener("connectionstatechange", () => {
        const state = pc.connectionState;
        if (state === "connected") setStatus("connected");
        if (state === "failed" || state === "disconnected") {
          setStatus("error");
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
          ) {
            return;
          }
          upsertDelta(`user:${item_id}:${content_index}`, "user", delta);
          return;
        }

        if (evt.type === "conversation.item.input_audio_transcription.completed") {
          const { item_id, content_index, transcript } = evt;
          if (
            typeof item_id !== "string" ||
            typeof content_index !== "number" ||
            typeof transcript !== "string"
          ) {
            return;
          }
          finalize(`user:${item_id}:${content_index}`, "user", transcript);
          return;
        }

        if (evt.type === "response.output_audio_transcript.delta") {
          const { item_id, content_index, delta } = evt;
          if (
            typeof item_id !== "string" ||
            typeof content_index !== "number" ||
            typeof delta !== "string"
          ) {
            return;
          }
          upsertDelta(`assistant:${item_id}:${content_index}`, "assistant", delta);
          return;
        }

        if (evt.type === "response.output_audio_transcript.done") {
          const { item_id, content_index, transcript } = evt;
          if (
            typeof item_id !== "string" ||
            typeof content_index !== "number" ||
            typeof transcript !== "string"
          ) {
            return;
          }
          finalize(`assistant:${item_id}:${content_index}`, "assistant", transcript);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${tokenData.value}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpRes.ok) {
        const text = await sdpRes.text();
        throw new Error(text || "Failed to establish Realtime WebRTC session");
      }

      const answer = {
        type: "answer" as const,
        sdp: await sdpRes.text(),
      };

      await pc.setRemoteDescription(answer);

      setStatus("connected");
    } catch (err) {
      disconnect();
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [disconnect, finalize, upsertDelta]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const { userMessages, assistantMessages } = useMemo(() => {
    const user: TranscriptMessage[] = [];
    const assistant: TranscriptMessage[] = [];

    for (const m of messages) {
      if (m.role === "user") user.push(m);
      else assistant.push(m);
    }

    return { userMessages: user, assistantMessages: assistant };
  }, [messages]);

  const orbHue = useMemo(() => {
    if (status === "connecting") return 280;
    if (status === "error") return 0;
    if (status === "connected") return voiceDetected ? 205 : 235;
    return 240;
  }, [status, voiceDetected]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-10">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Ariv’s AI Operator
              </h1>
              <p className="mt-2 text-sm text-white/60">Live Agent Execution</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                onClick={status === "connected" ? disconnect : connect}
                disabled={status === "connecting"}
                variant={status === "connected" ? "destructive" : "default"}
                className="rounded-full px-6"
              >
                {status === "connected" ? (
                  <>
                    <MicOff className="mr-2 h-4 w-4" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" />
                    Connect
                  </>
                )}
              </Button>

              <div className="text-sm text-white/60">Status: {status}</div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="text-xs font-medium uppercase tracking-widest text-white/50">
              You
            </div>

            <div className="mt-8 space-y-8">
              {userMessages.length === 0 ? (
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
                      className={`text-lg leading-7 ${m.final ? "" : "opacity-60"}`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="flex flex-col items-center justify-center">
              <div className="relative h-80 w-80 sm:h-96 sm:w-96">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-blue-500/20 via-purple-500/20 to-fuchsia-500/20 blur-2xl" />
                <div className="relative h-full w-full rounded-3xl overflow-hidden">
                  <VoicePoweredOrb
                    enableVoiceControl={status === "connected"}
                    hue={orbHue}
                    onVoiceDetected={setVoiceDetected}
                  />
                </div>
              </div>

              <div className="mt-6 text-center text-sm text-white/60">
                {status === "connected"
                  ? voiceDetected
                    ? "Listening"
                    : "Ready"
                  : status === "connecting"
                    ? "Connecting"
                    : "Press Connect to start"}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="text-xs font-medium uppercase tracking-widest text-white/50">
              System intelligence
            </div>

            <div className="mt-6 space-y-2 font-mono text-xs text-white/70">
              <div>→ Status: {status}</div>
              <div>→ Voice: {voiceDetected ? "detected" : "quiet"}</div>
              {error ? <div className="text-red-300">→ Error</div> : null}
            </div>

            <div className="mt-8 max-h-[55vh] space-y-5 overflow-auto pr-2">
              {assistantMessages.length === 0 ? (
                <div className="text-sm text-white/40">
                  Assistant responses will appear here.
                </div>
              ) : (
                assistantMessages.map((m) => (
                  <ChatBubble key={m.id} variant="received" className="items-start">
                    <ChatBubbleAvatar
                      fallback="AI"
                      src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"
                    />
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
