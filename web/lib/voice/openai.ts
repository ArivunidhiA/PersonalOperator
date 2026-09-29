import { runTool, type SessionInfo, type VoiceHandlers, type VoiceSession } from "./types";

/**
 * Optional paid fallback: OpenAI Realtime over WebRTC. The server sets the
 * session (prompt, tools, voice) during the SDP exchange. Tool calls run
 * through the same ticket-bound /api/tools/execute as Gemini.
 */
export async function startOpenAI(info: SessionInfo, mic: MediaStream, h: VoiceHandlers): Promise<VoiceSession> {
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let ended = false;
  let agentLevel = 0;
  let micLevel = 0;

  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    void audio.play().catch(() => {});
  };
  mic.getTracks().forEach((t) => pc.addTrack(t, mic));
  const dc = pc.createDataChannel("oai-events");
  const send = (msg: unknown) => dc.readyState === "open" && dc.send(JSON.stringify(msg));

  // Tool calls from one response are answered together after response.done,
  // with a single response.create (avoids double or cut-off answers).
  const pending: { callId: string; name: string; args: string }[] = [];

  const teardown = () => {
    try {
      dc.close();
      pc.close();
    } catch {
      /* ignore */
    }
    mic.getTracks().forEach((t) => t.stop());
    audio.srcObject = null;
  };
  const end = (reason: Parameters<VoiceHandlers["onEnded"]>[0], message?: string) => {
    if (ended) return;
    ended = true;
    teardown();
    h.onAgentFinal();
    h.onEnded(reason, message);
  };

  dc.onopen = () => {
    h.onLive();
    send({ type: "response.create" });
  };
  dc.onmessage = async (e) => {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(String(e.data));
    } catch {
      return;
    }
    switch (evt.type) {
      case "conversation.item.input_audio_transcription.delta":
        h.onUserDelta(String(evt.delta ?? ""));
        break;
      case "conversation.item.input_audio_transcription.completed":
        h.onUserFinal(String(evt.transcript ?? ""));
        break;
      case "response.output_audio_transcript.delta":
        h.onAgentDelta(String(evt.delta ?? ""));
        break;
      case "response.output_audio_transcript.done":
        h.onAgentFinal(String(evt.transcript ?? ""));
        break;
      case "output_audio_buffer.started":
        agentLevel = 0.6;
        h.onAgentSpeaking(true);
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        agentLevel = 0;
        h.onAgentSpeaking(false);
        break;
      case "response.function_call_arguments.done":
        pending.push({ callId: String(evt.call_id), name: String(evt.name), args: String(evt.arguments ?? "{}") });
        break;
      case "response.done": {
        if (!pending.length) break;
        const calls = pending.splice(0);
        const outputs = await Promise.all(
          calls.map(async (c) => {
            h.onToolStart(c.name);
            let args: unknown = {};
            try {
              args = JSON.parse(c.args);
            } catch {
              /* empty args */
            }
            const out = await runTool(info.ticket, c.name, args);
            h.onToolEnd(c.name, out.ok, out.card);
            return { callId: c.callId, output: out.result };
          }),
        );
        for (const o of outputs) send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: o.callId, output: o.output } });
        send({ type: "response.create" });
        break;
      }
      case "error": {
        const err = evt.error as { code?: string; message?: string } | undefined;
        if (err?.code === "rate_limit_exceeded") end("quota", "The voice agent is busy right now. Try again in a minute.");
        break;
      }
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") end("dropped", "The call dropped. You can start a new one.");
  };
  // The server can end the session (time limit, errors): the data channel closes.
  dc.onclose = () => end("dropped", "The call ended. You can start a new one.");

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const res = await fetch("/api/voice/openai-sdp", {
    method: "POST",
    headers: { "Content-Type": "application/sdp", "x-session-ticket": info.ticket },
    body: offer.sdp,
  });
  if (!res.ok) {
    // Setup failed: clean up without reporting a finished call (nothing to save).
    ended = true;
    teardown();
    throw new Error("sdp exchange failed");
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

  // Rough mic level for visuals.
  try {
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    ctx.createMediaStreamSource(mic).connect(an);
    const data = new Uint8Array(an.fftSize);
    const tick = () => {
      if (ended) return void ctx.close().catch(() => {});
      an.getByteTimeDomainData(data);
      let sq = 0;
      for (const v of data) sq += ((v - 128) / 128) ** 2;
      micLevel = Math.min(1, Math.sqrt(sq / data.length) * 4);
      requestAnimationFrame(tick);
    };
    tick();
  } catch {
    /* visuals only */
  }

  return {
    stop: (reason = "hangup") => end(reason),
    setMuted: (muted) => mic.getAudioTracks().forEach((t) => (t.enabled = !muted)),
    levels: () => ({ mic: micLevel, agent: agentLevel }),
  };
}
