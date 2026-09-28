import { runTool, type EndReason, type SessionInfo, type VoiceHandlers, type VoiceSession } from "./types";

/**
 * Browser client for Gemini Live over WebSocket.
 * - The prompt/tools are locked inside the ephemeral token; we only send setup + audio.
 * - Mic: AudioWorklet -> 16 kHz PCM16. Playback: AudioWorklet ring buffer, flushed on barge-in.
 * - Echo: Chromium's echo canceller only "hears" audio played through WebRTC, so on
 *   Chromium we route playback through a local RTCPeerConnection loopback into an
 *   <audio> element (falling back to plain playback if the loopback can't connect).
 * Must be started from a user gesture (tap), because of iOS audio rules.
 */
export type Prepared = { ctx: AudioContext; mic: MediaStream };

/** Gesture-bound work (AudioContext + mic permission), before any network call. */
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
  const resumed = ctx.resume().catch(() => {}); // called synchronously inside the tap
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    await resumed;
    return { ctx, mic };
  } catch (err) {
    void ctx.close().catch(() => {});
    throw err;
  }
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

/** Chromium echo-cancel workaround. Resolves null (use plain playback) if it can't connect in 2 s. */
async function loopbackPlayback(ctx: AudioContext, node: AudioNode, onLaterFailure: () => void): Promise<{ close: () => void } | null> {
  if (isSafari() || typeof RTCPeerConnection === "undefined") return null;
  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  const el = new Audio();
  const dest = ctx.createMediaStreamDestination();
  const close = () => {
    el.srcObject = null;
    a.close();
    b.close();
    try {
      node.disconnect(dest);
    } catch {
      /* already */
    }
  };
  try {
    node.connect(dest);
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
    b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
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
    const ok = await new Promise<boolean>((resolve) => {
      const done = (v: boolean) => {
        clearTimeout(t);
        resolve(v);
      };
      const t = setTimeout(() => done(b.connectionState === "connected"), 2000);
      b.onconnectionstatechange = () => {
        if (b.connectionState === "connected") done(true);
        if (b.connectionState === "failed") done(false);
      };
    });
    if (!ok) {
      close();
      return null;
    }
    // If the loopback dies mid-call, fall back to direct playback instead of going silent.
    b.onconnectionstatechange = () => {
      if (b.connectionState === "failed" || b.connectionState === "closed") {
        close();
        onLaterFailure();
      }
    };
    return { close };
  } catch {
    close();
    return null;
  }
}

const CONNECT_TIMEOUT_MS = 15_000;

export async function startGemini(info: SessionInfo, prepared: Prepared, h: VoiceHandlers): Promise<VoiceSession> {
  const g = info.gemini!;
  const { ctx, mic } = prepared;
  if (!ctx.audioWorklet) throw new Error("This browser can't process audio here. Try Safari or Chrome directly.");
  await ctx.audioWorklet.addModule("/audio/pcm-capture.js");
  await ctx.audioWorklet.addModule("/audio/pcm-player.js");

  const capture = new AudioWorkletNode(ctx, "pcm-capture");
  const player = new AudioWorkletNode(ctx, "pcm-player", { outputChannelCount: [1] });
  const src = ctx.createMediaStreamSource(mic);
  src.connect(capture);
  let loop = await loopbackPlayback(ctx, player, () => {
    loop = null;
    try {
      player.connect(ctx.destination);
    } catch {
      /* already connected */
    }
  });
  if (!loop) player.connect(ctx.destination);

  let micLevel = 0;
  let agentLevel = 0;
  let speaking = false;
  let ended = false;
  let live = false;
  const cancelled = new Set<string>();
  const timers: ReturnType<typeof setTimeout>[] = [];

  // Stall watchdog: very occasionally the model goes quiet after a turn. If the
  // caller said a real sentence (or a tool result went back) and nothing comes
  // back within 8 s, nudge once. Late speech-to-text for a turn the model
  // already answered, and background noise (< 3 words), never trigger it.
  let heard = "";
  let nudged = false;
  let lastModelOutput = 0;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  };
  const armWatchdog = (force = false) => {
    if (!force && Date.now() - lastModelOutput < 2500) return;
    clearWatchdog();
    watchdog = setTimeout(() => {
      if (ended || nudged || speaking || (!force && heard.trim().split(/\s+/).length < 3)) return;
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
    clearWatchdog();
    timers.forEach(clearTimeout);
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

  const end = (reason: EndReason, message?: string) => {
    if (ended) return;
    ended = true;
    live = false;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
    } catch {
      /* ignore */
    }
    teardown();
    h.onAgentFinal();
    h.onEnded(reason, message);
  };

  // Mic unplugged / AirPods switched away / OS took the mic: end with a clear message.
  mic.getAudioTracks().forEach((t) => {
    t.onended = () => end("dropped", "Your microphone disconnected, so the call ended. You can start a new one.");
  });
  // iOS suspends audio for phone calls and interruptions; try to come back.
  ctx.onstatechange = () => {
    if (!ended && (ctx.state === "suspended" || (ctx.state as string) === "interrupted")) {
      void ctx.resume().catch(() => end("dropped", "Audio got interrupted, so the call ended. Tap Talk again to start a new one."));
    }
  };

  timers.push(
    setTimeout(() => {
      if (!live && !ended) end("error", "Couldn't connect to the voice service. Check your connection and try again.");
    }, CONNECT_TIMEOUT_MS),
  );

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
          generationComplete?: boolean;
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
        lastModelOutput = Date.now();
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
      if (sc.turnComplete || sc.generationComplete) {
        lastModelOutput = Date.now();
        clearWatchdog();
      }
      if (sc.turnComplete) h.onAgentFinal();
    }
    const cancel = msg.toolCallCancellation as { ids?: string[] } | undefined;
    cancel?.ids?.forEach((id) => cancelled.add(id));

    const toolCall = msg.toolCall as { functionCalls?: { id: string; name: string; args?: unknown }[] } | undefined;
    if (toolCall?.functionCalls?.length) {
      clearWatchdog();
      const responses = await Promise.all(
        toolCall.functionCalls.map(async (fc) => {
          h.onToolStart(fc.name);
          const out = await runTool(info.ticket, fc.name, fc.args ?? {});
          h.onToolEnd(fc.name, out.ok, cancelled.has(fc.id) || ended ? undefined : out.card);
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
      if (keep.length && !ended) {
        send({ toolResponse: { functionResponses: keep } });
        if (keep.some((r) => r.name !== "generate_summary")) armWatchdog(true);
      }
    }
    const goAway = msg.goAway as { timeLeft?: string } | undefined;
    if (goAway) {
      // The server will close soon. Let the agent finish, then end cleanly.
      const left = Number.parseFloat(String(goAway.timeLeft ?? ""));
      const secs = Number.isFinite(left) ? Math.max(2, left - 2) : 10;
      timers.push(setTimeout(() => end("time", "The voice service is wrapping up this call. Thanks for chatting!"), secs * 1000));
    }
  };

  ws.onerror = () => {
    /* onclose follows with a code */
  };
  ws.onclose = (e) => {
    if (ended) return;
    const reason = e.reason || "";
    if (e.code === 1000) return end("hangup");
    if (/RESOURCE_EXHAUSTED|quota/i.test(reason)) {
      return end("quota", "The free voice quota ran out for now. Try again later, or book a call with Ariv below.");
    }
    if (/location|region|country/i.test(reason) && /not supported|unsupported|not available/i.test(reason)) {
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
