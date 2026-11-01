import { createLiveGuard, type GuardHit, type GuardRule } from "../live-guard";
import { createStallGuard, STALL_MS } from "./stall-guard";
import { startLiveCaption, type LiveCaption } from "./live-caption";
import { createVadGate } from "./vad-gate";
import { runTool, type EndReason, type SessionInfo, type VoiceHandlers, type VoiceSession } from "./types";

/**
 * Browser client for Gemini Live over WebSocket.
 * - The prompt/tools are locked inside the ephemeral token; we only send setup + audio.
 * - Mic: AudioWorklet -> 16 kHz PCM16. Playback: AudioWorklet ring buffer, flushed on barge-in.
 * - Echo: Chromium's echo canceller only "hears" audio played through WebRTC, so on
 *   Chromium we route playback through a local RTCPeerConnection loopback into an
 *   <audio> element (falling back to plain playback if the loopback can't connect).
 * - Reconnect: the same token reconnects after a drop or goAway. Handles alone don't
 *   restore context (only one arrives, at setup), so turns newer than the handle are
 *   re-seeded from the client's own transcript.
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
const RECONNECT_TIMEOUT_MS = 8_000;
const RECONNECT_DELAYS_MS = [300, 1200];
const MAX_RECONNECTS = RECONNECT_DELAYS_MS.length; // token `uses` is this + 1 (gemini-token.ts)
const MAX_HELD_FRAMES = 94; // ~3 s of mic audio held across a reconnect
const MAX_SEEDED_TURNS = 40;
// Server VAD can hold a turn open through long pauses; after this much mic silence, end it from here.
const CALLER_END_SILENCE_MS = 1500;
const TOOL_NOTE = "Don't repeat anything you already said before this call. Continue from there.";
const NUDGES = {
  1: "(The caller is waiting for your reply to what they just said. Answer briefly, out loud.)",
  2: "(The caller is waiting and can't hear you. Say something now, out loud, in one short line. Don't call a tool.)",
};
const RESUME_NUDGE = "(The caller is waiting: the line dropped for a moment. Continue from where you stopped, without repeating yourself or mentioning the drop.)";
// Never quote the line: this goes back to the model as plain text.
const CORRECTIONS: Record<GuardRule, string> = {
  "named company": "(Correction: don't name that company or say whether he worked there. In one short line, say your notes only cover the work he's shared, then carry on.)",
  "claims to be human": "(Correction: you are Ariv's AI voice agent, not a person. Say so in one short line, then carry on.)",
  "claimed title": "(Correction: you stated a job title Ariv doesn't hold. In one short line, give his real title from your notes, then carry on.)",
  "claimed certification": "(Correction: you stated a certification Ariv doesn't hold. In one short line, correct that, then carry on.)",
  "markdown or planning text": "(Correction: that wasn't meant to be spoken. Answer the caller again in plain spoken words, in one or two short lines.)",
};
const CUT_TURN_MAX_MS = 2500; // the cut turn should end by itself; never stay muted longer than this
const GIVE_UP_LINE = "Sorry, I'm having trouble answering right now. Try saying that again, or reach Ariv with the links on this page.";

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
  let liveAt: number | null = null; // epoch ms of setupComplete
  const cancelled = new Set<string>();
  const timers: ReturnType<typeof setTimeout>[] = [];

  // A transcript only counts as a new, unanswered turn if the caller's activity
  // began after the model's last output. Late speech-to-text for a turn the model
  // already answered lands well after it, and echo doesn't count. Mic level is the
  // fallback if the server sends no activity events.
  let lastModelOutput = 0;
  let lastVoiceAt = 0; // last time the mic carried voice while the agent was silent
  let activitySinceOutput = false;
  let activityOpen = false;
  let turnAudio = false; // the current model turn produced audio
  const VOICE_RMS = 0.01;

  let ws!: WebSocket;
  const send = (msg: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const say = (text: string) => send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } });

  // Reconnect state. `liveAt` and the handlers stay as they are, so the UI and its call timer never notice.
  let handle: string | undefined;
  let handleAt = 0;
  let reconnects = 0;
  let moving = false; // goAway seen: switch connection at the next quiet moment
  const held: ArrayBuffer[] = [];
  const history: { role: "user" | "model"; text: string; at: number }[] = [];
  let userText = "";
  let agentText = "";
  const commitTurn = () => {
    const at = Date.now();
    if (userText.trim()) history.push({ role: "user", text: userText.trim(), at });
    if (agentText.trim()) history.push({ role: "model", text: agentText.trim(), at });
    userText = agentText = "";
    history.splice(0, Math.max(0, history.length - MAX_SEEDED_TURNS));
  };

  // Live guard. A failure here switches it off for the call and changes nothing else.
  let liveGuard: ReturnType<typeof createLiveGuard> | null = createLiveGuard();
  const checked = (run: (c: NonNullable<typeof liveGuard>) => GuardHit | null | void) => {
    try {
      return (liveGuard && run(liveGuard)) || null;
    } catch {
      liveGuard = null;
      return null;
    }
  };
  let corrected = false; // one correction per caller turn, so it can't loop with the model
  let cutTurn: ReturnType<typeof setTimeout> | null = null; // dropping the rest of a cut turn
  const endCut = () => {
    if (cutTurn) clearTimeout(cutTurn);
    cutTurn = null;
  };
  // The last word stays off the screen until the guard has judged it.
  let heldText = "";
  const showAgent = (text: string) => {
    if (!text) return;
    agentText += text;
    h.onAgentDelta(text);
  };
  const cut = (hit: GuardHit, turnOver = false) => {
    heldText = "";
    player.port.postMessage("flush");
    h.onAgentFinal();
    endCut();
    if (!turnOver) cutTurn = setTimeout(endCut, CUT_TURN_MAX_MS);
    guard.owe();
    if (corrected) return;
    corrected = true;
    say(CORRECTIONS[hit.rule]);
  };

  // Live captions run beside the call. Nothing in them may reach it, so every touch is fenced.
  let captions: LiveCaption | null = null;
  const onCaptions = (run: (c: LiveCaption) => void) => {
    try {
      if (captions) run(captions);
    } catch {
      captions = null;
    }
  };
  const fenced = <A extends unknown[]>(fn: ((...a: A) => void) | undefined) => (...a: A) => {
    try {
      fn?.(...a);
    } catch {
      /* a caption display bug stays out of the call */
    }
  };
  const startCaptions = () => {
    const track = mic.getAudioTracks()[0];
    if (!h.onCaption || !track) return;
    try {
      captions = startLiveCaption(track, { onCaption: fenced(h.onCaption.bind(h)), onCancel: fenced(h.onCaptionCancel?.bind(h)) });
    } catch {
      captions = null;
    }
  };

  const guard = createStallGuard({
    playing: () => speaking,
    nudge: (level) => say(NUDGES[level]),
    reconnect: () => reconnect(0),
    giveUp: () => {
      h.onAgentDelta(GIVE_UP_LINE);
      h.onAgentFinal();
    },
  });

  // The gate also watches for caller silence. By default audio always flows and it only
  // ends a turn the server is holding open. NEXT_PUBLIC_CLIENT_VAD=1 also pauses audio in silence.
  const gated = process.env.NEXT_PUBLIC_CLIENT_VAD === "1";
  const gate = createVadGate<ArrayBuffer>(gated ? {} : { hangoverMs: CALLER_END_SILENCE_MS });
  const sendAudio = (pcm: ArrayBuffer) => send({ realtimeInput: { audio: { data: b64FromBuffer(pcm), mimeType: "audio/pcm;rate=16000" } } });

  capture.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number; rms?: number }>) => {
    micLevel = Math.min(1, e.data.level * 4);
    if (!speaking && e.data.level > VOICE_RMS) {
      lastVoiceAt = Date.now();
      if (activityOpen) guard.callerStillTalking();
    }
    if (!live) {
      if (liveAt !== null) {
        held.push(e.data.pcm);
        if (held.length > MAX_HELD_FRAMES) held.shift();
      }
      return;
    }
    const out = gate.push(e.data.rms ?? e.data.level, e.data.pcm, Date.now());
    if (gated) out.send.forEach(sendAudio);
    else sendAudio(e.data.pcm);
    if (out.streamEnd && (gated || activityOpen)) {
      send({ realtimeInput: { audioStreamEnd: true } });
      if (activityOpen) guard.callerQuiet();
    }
  };
  player.port.onmessage = (e: MessageEvent<{ speaking: boolean; level: number }>) => {
    agentLevel = Math.min(1, e.data.level * 4);
    if (e.data.speaking !== speaking) {
      speaking = e.data.speaking;
      h.onAgentSpeaking(speaking);
      onCaptions((c) => c.setAgentSpeaking(speaking));
    }
  };

  const teardown = () => {
    onCaptions((c) => c.stop());
    captions = null;
    guard.stop();
    endCut();
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

  const connect = () => {
    const sock = new WebSocket(`${g.wsUrl}?access_token=${encodeURIComponent(g.token)}`);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.onopen = () => send({ setup: { model: `models/${g.model}`, ...(handle ? { sessionResumption: { handle } } : {}) } });
    sock.onmessage = onMessage(sock);
    sock.onerror = () => {
      /* onclose follows with a code */
    };
    sock.onclose = (e) => {
      if (sock === ws) onClose(e);
    };
    if (liveAt === null) return;
    timers.push(
      setTimeout(() => {
        if (sock !== ws || live || ended) return;
        sock.onclose = null;
        sock.close();
        if (!reconnect(0)) dropped();
      }, RECONNECT_TIMEOUT_MS),
    );
  };

  const dropped = () => end("dropped", "The call dropped. You can start a new one.");

  /** Opens a new connection. False when the call has used its reconnects. */
  function reconnect(delayMs = RECONNECT_DELAYS_MS[reconnects] ?? 0): boolean {
    if (ended || reconnects >= MAX_RECONNECTS) return false;
    reconnects++;
    live = false;
    moving = false;
    activityOpen = false;
    guard.reset();
    endCut();
    checked((c) => c.reset());
    showAgent(heldText);
    heldText = "";
    const old = ws;
    old.onclose = null;
    old.onmessage = null;
    try {
      if (old.readyState === WebSocket.OPEN) old.close(1000);
    } catch {
      /* ignore */
    }
    timers.push(setTimeout(() => !ended && connect(), delayMs));
    return true;
  }

  const onResumed = () => {
    commitTurn();
    const turns = history.filter((t) => t.at > handleAt).map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
    if (turns.length) send({ clientContent: { turns, turnComplete: false } });
    held.splice(0).forEach(sendAudio);
    if (turnAudio || guard.pending()) {
      turnAudio = false;
      say(RESUME_NUDGE);
      guard.owe();
    }
  };

  const onMessage = (sock: WebSocket) => async (ev: MessageEvent) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer));
    } catch {
      return;
    }
    if (msg.setupComplete) {
      live = true;
      if (liveAt !== null) return onResumed();
      liveAt = Date.now();
      h.onLive();
      startCaptions();
      // Live waits for input; nudge it to greet first.
      say(g.greeting);
      guard.owe(STALL_MS.next);
      return;
    }
    const update = msg.sessionResumptionUpdate as { newHandle?: string; resumable?: boolean } | undefined;
    if (update?.newHandle && update.resumable !== false) {
      handle = update.newHandle;
      handleAt = Date.now();
    }
    const activity = msg.voiceActivity as { type?: string; voiceActivityType?: string } | undefined;
    const activityType = activity?.type ?? activity?.voiceActivityType;
    if (activityType === "ACTIVITY_START") {
      activityOpen = true;
      activitySinceOutput = true;
      corrected = false;
      guard.callerStart();
    } else if (activityType === "ACTIVITY_END") {
      activityOpen = false;
      guard.callerEnd();
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
        onCaptions((c) => c.bargeIn());
        showAgent(heldText);
        heldText = "";
        h.onAgentFinal();
        endCut();
        checked((c) => c.reset());
      }
      if (sc.inputTranscription?.text) {
        userText += sc.inputTranscription.text;
        h.onUserDelta(sc.inputTranscription.text);
        if (activitySinceOutput || lastVoiceAt > lastModelOutput) guard.heard(sc.inputTranscription.text);
      }
      if (sc.inputTranscription?.finished) h.onUserFinal();
      // Only audio counts as an answer: the model can send junk text and no sound.
      const audio = (sc.modelTurn?.parts ?? []).flatMap((p) => (p.inlineData?.data ? [p.inlineData.data] : []));
      if (cutTurn) audio.length = 0;
      if (audio.length) {
        lastModelOutput = Date.now();
        activitySinceOutput = false;
        turnAudio = true;
        guard.answered();
      }
      for (const data of audio) {
        const pcm = bufferFromB64(data);
        player.port.postMessage({ pcm }, [pcm]);
      }
      // Before the guard: captions need the agent's words even when the screen doesn't get them.
      if (sc.outputTranscription?.text) onCaptions((c) => c.addAgentText(sc.outputTranscription!.text!));
      if (sc.outputTranscription?.text && !cutTurn) {
        const text = sc.outputTranscription.text;
        const hit = checked((c) => c.push(text));
        if (hit) cut(hit);
        else {
          const all = heldText + text;
          const at = liveGuard ? all.search(/\S*$/) : all.length;
          heldText = all.slice(at);
          showAgent(all.slice(0, at));
        }
      }
      // Generation ends seconds before playback does, so a last sentence can still be cut.
      if (sc.generationComplete && !cutTurn) {
        const hit = checked((c) => c.flush());
        if (hit) cut(hit);
        else {
          showAgent(heldText);
          heldText = "";
        }
      }
      if (sc.turnComplete) {
        const hit = cutTurn ? null : checked((c) => c.flush());
        endCut();
        checked((c) => c.reset());
        if (!hit) showAgent(heldText);
        heldText = "";
        if (turnAudio) lastModelOutput = Date.now();
        else guard.emptyTurn();
        turnAudio = false;
        commitTurn();
        h.onAgentFinal();
        if (hit) cut(hit, true);
        else if (moving) reconnect(0);
      }
    }
    const cancel = msg.toolCallCancellation as { ids?: string[] } | undefined;
    cancel?.ids?.forEach((id) => cancelled.add(id));

    const toolCall = msg.toolCall as { functionCalls?: { id: string; name: string; args?: unknown }[] } | undefined;
    if (toolCall?.functionCalls?.length) {
      guard.toolStart();
      const responses = await Promise.all(
        toolCall.functionCalls.map(async (fc) => {
          h.onToolStart(fc.name);
          const out = await runTool(info.ticket, fc.name, fc.args ?? {});
          h.onToolEnd(fc.name, out.ok, cancelled.has(fc.id) || ended ? undefined : out.card);
          const recap = fc.name === "generate_summary";
          return {
            id: fc.id,
            name: fc.name,
            response: { result: out.result, ...(recap ? {} : { note: TOOL_NOTE }) },
            // Recap card is fire-and-forget: don't make the model talk again about it.
            ...(recap ? { scheduling: "SILENT" } : {}),
          };
        }),
      );
      guard.toolEnd();
      const keep = responses.filter((r) => !cancelled.has(r.id));
      if (keep.length && !ended) {
        if (keep.some((r) => r.name !== "generate_summary")) guard.owe();
        // The connection changed while the tool ran: that call id is gone, so ask for the reply instead.
        if (sock === ws) send({ toolResponse: { functionResponses: keep } });
      }
    }
    const goAway = msg.goAway as { timeLeft?: string } | undefined;
    if (goAway) {
      const left = Number.parseFloat(String(goAway.timeLeft ?? ""));
      const secs = Number.isFinite(left) ? Math.max(0, left - 2) : 8;
      if (reconnects >= MAX_RECONNECTS) {
        // Nothing left to reconnect with. Let the agent finish, then end cleanly.
        timers.push(setTimeout(() => end("time", "The voice service is wrapping up this call. Thanks for chatting!"), Math.max(2, secs) * 1000));
      } else if (!turnAudio && !guard.pending()) {
        reconnect(0);
      } else {
        moving = true;
        timers.push(setTimeout(() => sock === ws && moving && reconnect(0), secs * 1000));
      }
    }
  };

  const onClose = (e: CloseEvent) => {
    if (ended) return;
    const reason = e.reason || "";
    if (/RESOURCE_EXHAUSTED|quota/i.test(reason)) {
      return end("quota", "The free voice quota ran out for now. Try again later, or book a call with Ariv below.");
    }
    if (/location|region|country/i.test(reason) && /not supported|unsupported|not available/i.test(reason)) {
      return end("error", "Voice chat isn't available where you are. You can still reach Ariv with the links below.");
    }
    if (liveAt === null) return end("error", "Couldn't connect to the voice service. Try again in a minute.");
    if (!reconnect()) dropped();
  };

  connect();

  return {
    stop: (reason = "hangup") => end(reason),
    setMuted: (muted) => {
      capture.port.postMessage({ muted });
      onCaptions((c) => c.setMuted(muted));
    },
    liveAt: () => liveAt,
    levels: () => ({ mic: micLevel, agent: agentLevel }),
  };
}
