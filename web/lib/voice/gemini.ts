import { runTool, type SessionInfo, type VoiceHandlers, type VoiceSession } from "./types";

/**
 * Browser client for Gemini Live over WebSocket.
 * - The prompt/tools are locked inside the ephemeral token; we only send setup + audio.
 * - Mic: AudioWorklet -> 16 kHz PCM16. Playback: AudioWorklet ring buffer, flushed on barge-in.
 * - Echo: Chromium's echo canceller only "hears" audio played through WebRTC, so on
 *   Chromium we route playback through a local RTCPeerConnection loopback into an
 *   <audio> element. Safari/Firefox cancel echo for Web Audio output already.
 * Must be started from a user gesture (tap), because of iOS audio rules.
 */
type Prepared = {
  ctx: AudioContext;
  mic: MediaStream;
};

/** Do the gesture-bound work first (AudioContext + mic permission), before any network call. */
export async function prepareAudio(): Promise<Prepared> {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = "play-and-record"; // iOS 17+: keep the loudspeaker, allow mic
    } catch {
      /* not supported */
    }
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const resumed = ctx.resume();
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  await resumed;
  return { ctx, mic };
}

const b64FromBuffer = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const bufferFromB64 = (b64: string) => {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
};

const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

async function loopbackPlayback(ctx: AudioContext, node: AudioNode): Promise<{ el: HTMLAudioElement; close: () => void } | null> {
  if (isSafari() || typeof RTCPeerConnection === "undefined") return null;
  try {
    const dest = ctx.createMediaStreamDestination();
    node.connect(dest);
    const a = new RTCPeerConnection();
    const b = new RTCPeerConnection();
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
    b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
    const el = new Audio();
    el.autoplay = true;
    b.ontrack = (e) => {
      el.srcObject = e.streams[0];
      void el.play().catch(() => {});
    };
    dest.stream.getTracks().forEach((t) => a.addTrack(t, dest.stream));
    const offer = await a.createOffer();
    await a.setLocalDescription(offer);
    await b.setRemoteDescription(offer);
    const answer = await b.createAnswer();
    await b.setLocalDescription(answer);
    await a.setRemoteDescription(answer);
    return {
      el,
      close: () => {
        el.srcObject = null;
        a.close();
        b.close();
      },
    };
  } catch {
    return null;
  }
}

export async function startGemini(info: SessionInfo, prepared: Prepared, h: VoiceHandlers): Promise<VoiceSession> {
  const g = info.gemini!;
  const { ctx, mic } = prepared;
  await ctx.audioWorklet.addModule("/audio/pcm-capture.js");
  await ctx.audioWorklet.addModule("/audio/pcm-player.js");

  const capture = new AudioWorkletNode(ctx, "pcm-capture");
  const player = new AudioWorkletNode(ctx, "pcm-player", { outputChannelCount: [1] });
  const src = ctx.createMediaStreamSource(mic);
  src.connect(capture);
  const loop = await loopbackPlayback(ctx, player);
  if (!loop) player.connect(ctx.destination);

  let micLevel = 0;
  let agentLevel = 0;
  let speaking = false;
  let ended = false;
  let live = false;
  const cancelled = new Set<string>();

  // Stall watchdog: very occasionally the model goes quiet after a turn. If the
  // caller said a real sentence (or a tool result went back) and nothing comes
  // back within 8 s, nudge once. Background noise (< 3 words) never triggers it.
  let heard = "";
  let nudged = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  };
  const armWatchdog = () => {
    clearWatchdog();
    watchdog = setTimeout(() => {
      if (ended || nudged || heard.trim().split(/\s+/).length < 3) return;
      nudged = true;
      send({ realtimeInput: { text: "(The caller is waiting for your reply to what they just said. Answer briefly.)" } });
    }, 8000);
  };

  const ws = new WebSocket(`${g.wsUrl}?access_token=${encodeURIComponent(g.token)}`);
  ws.binaryType = "arraybuffer";

  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  capture.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
    micLevel = Math.min(1, e.data.level * 4);
    if (live) send({ realtimeInput: { audio: { data: b64FromBuffer(e.data.pcm), mimeType: "audio/pcm;rate=16000" } } });
  };
  player.port.onmessage = (e: MessageEvent<{ speaking: boolean; level: number }>) => {
    agentLevel = Math.min(1, e.data.level * 4);
    if (e.data.speaking !== speaking) {
      speaking = e.data.speaking;
      h.onAgentSpeaking(speaking);
    }
  };

  const teardown = () => {
    try {
      capture.port.onmessage = null;
      player.port.onmessage = null;
      src.disconnect();
      capture.disconnect();
      player.disconnect();
    } catch {
      /* already gone */
    }
    mic.getTracks().forEach((t) => t.stop());
    loop?.close();
    void ctx.close().catch(() => {});
  };

  const end = (reason: Parameters<VoiceHandlers["onEnded"]>[0], message?: string) => {
    if (ended) return;
    ended = true;
    live = false;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
    } catch {
      /* ignore */
    }
    clearWatchdog();
    teardown();
    h.onAgentFinal();
    h.onEnded(reason, message);
  };

  ws.onopen = () => send({ setup: { model: `models/${g.model}` } });

  ws.onmessage = async (ev) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer));
    } catch {
      return;
    }
    if (msg.setupComplete) {
      live = true;
      h.onLive();
      // Live waits for input; nudge it to greet first.
      send({ clientContent: { turns: [{ role: "user", parts: [{ text: g.greeting }] }], turnComplete: true } });
      return;
    }
    const sc = msg.serverContent as
      | {
          modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
          inputTranscription?: { text?: string; finished?: boolean };
          outputTranscription?: { text?: string };
          interrupted?: boolean;
          turnComplete?: boolean;
        }
      | undefined;
    if (sc) {
      if (sc.interrupted) {
        player.port.postMessage("flush");
        h.onAgentFinal();
      }
      if (sc.inputTranscription?.text) {
        heard += sc.inputTranscription.text;
        h.onUserDelta(sc.inputTranscription.text);
        armWatchdog();
      }
      if (sc.inputTranscription?.finished) h.onUserFinal();
      if (sc.modelTurn?.parts?.length || sc.outputTranscription?.text) {
        clearWatchdog();
        heard = "";
        nudged = false;
      }
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data) {
          const pcm = bufferFromB64(p.inlineData.data);
          player.port.postMessage({ pcm }, [pcm]);
        }
      }
      if (sc.outputTranscription?.text) h.onAgentDelta(sc.outputTranscription.text);
      if (sc.turnComplete) h.onAgentFinal();
    }
    const cancel = msg.toolCallCancellation as { ids?: string[] } | undefined;
    cancel?.ids?.forEach((id) => cancelled.add(id));

    const toolCall = msg.toolCall as { functionCalls?: { id: string; name: string; args?: unknown }[] } | undefined;
    if (toolCall?.functionCalls?.length) {
      const responses = await Promise.all(
        toolCall.functionCalls.map(async (fc) => {
          h.onToolStart(fc.name);
          const out = await runTool(info.ticket, fc.name, fc.args ?? {});
          h.onToolEnd(fc.name, out.ok, cancelled.has(fc.id) ? undefined : out.card);
          return {
            id: fc.id,
            name: fc.name,
            response: { result: out.result },
            // Recap card is fire-and-forget: don't make the model talk again about it.
            ...(fc.name === "generate_summary" ? { scheduling: "SILENT" } : {}),
          };
        }),
      );
      const keep = responses.filter((r) => !cancelled.has(r.id));
      if (keep.length) {
        send({ toolResponse: { functionResponses: keep } });
        if (keep.some((r) => r.name !== "generate_summary")) {
          heard = heard || "tool result sent";
          armWatchdog();
        }
      }
    }
    if (msg.goAway) end("time", "Call time's up. Thanks for chatting!");
  };

  ws.onerror = () => {
    /* onclose follows with a code */
  };
  ws.onclose = (e) => {
    if (ended) return;
    const reason = (e.reason || "").toLowerCase();
    if (e.code === 1000) return end("hangup");
    if (/exhaust|quota|rate|resource/.test(reason) || e.code === 1011) {
      return end("quota", "The free voice quota ran out for now. Try again later, or book a call with Ariv below.");
    }
    if (/location|region|country|not supported/.test(reason) || e.code === 1008) {
      return end("error", "Voice chat isn't available where you are. You can still reach Ariv with the links below.");
    }
    end(live ? "dropped" : "error", live ? "The call dropped. You can start a new one." : "Couldn't connect to the voice service. Try again in a minute.");
  };

  return {
    stop: (reason = "hangup") => end(reason),
    setMuted: (muted) => capture.port.postMessage({ muted }),
    levels: () => ({ mic: micLevel, agent: agentLevel }),
  };
}
