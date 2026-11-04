// Playback for Gemini Live: 24 kHz PCM16 chunks -> a ring buffer resampled to the
// context rate. "flush" drops everything queued (barge-in). A short pre-roll
// absorbs network jitter; underflow fades out instead of clicking; overflow drops
// the oldest audio. Posts speaking state and output level for the UI.
// The mic is wired in as this node's input, so barge-in is judged here against
// the exact audio just played (barge-detector.js): a pause takes one block, not a
// round trip to the server.
const PREROLL = 2400; // 100 ms at 24 kHz
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 24000 * 180; // 3 min
    this.buf = new Float32Array(this.size);
    this.read = 0;
    this.write = 0;
    this.frac = 0;
    this.ratio = 24000 / sampleRate;
    this.playing = false;
    this.waitBlocks = 0;
    this.last = 0;
    this.gain = 1;
    this.speaking = false;
    this.tick = 0;
    this.barge = globalThis.BargeDetector ? new globalThis.BargeDetector(sampleRate) : null;
    this.muted = false;
    this.hold = 1; // 1 = playing, fades to 0 while a possible barge-in is checked
    this.quietBlocks = Infinity; // blocks since the agent last made a sound
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d === "flush") return this.flush();
      if (d && d.confirm) return this.decide(this.barge && (this.barge.paused || this.midReply()) && this.barge.confirm());
      if (d && d.debug) {
        this.debug = true; // test rigs only: stream the detector's view
        return;
      }
      if (d && "muted" in d) {
        this.muted = d.muted;
        return;
      }
      if (d && d.pcm) {
        const pcm = new Int16Array(d.pcm);
        for (let i = 0; i < pcm.length; i++) {
          this.buf[this.write] = pcm[i] / 32768;
          this.write = (this.write + 1) % this.size;
          if (this.write === this.read) this.read = (this.read + 1) % this.size; // overflow: drop oldest
        }
      }
    };
  }
  flush() {
    this.read = this.write = 0;
    this.frac = 0;
    this.playing = false;
  }
  /** Mid-reply, including a gap between sentences or a late network chunk. */
  midReply() {
    return this.available() > 2 || this.quietBlocks * 128 < sampleRate * 1.5;
  }
  decide(result) {
    if (!result) return;
    const had = this.available() > 2;
    if (result === "commit") this.flush();
    this.port.postMessage({ barge: result, had });
  }
  available() {
    return (this.write - this.read + this.size) % this.size;
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    const paused = this.barge && this.barge.paused;
    const avail = this.available();
    if (!this.playing) {
      // Start after a short pre-roll, or after ~50 ms of waiting for a short reply.
      if (avail >= PREROLL || (avail > 0 && ++this.waitBlocks > 18)) {
        this.playing = true;
        this.waitBlocks = 0;
        this.gain = 0; // fade in over ~5 ms so a start never clicks
      }
    }
    let sq = 0;
    for (let i = 0; i < out.length; i++) {
      // A possible barge-in: fade out in ~2 ms and hold the place, so a false alarm resumes mid-word.
      this.hold = paused ? Math.max(0, this.hold - 1 / 96) : Math.min(1, this.hold + 1 / 256);
      if (paused && this.hold === 0) {
        out[i] = 0;
        continue;
      }
      if (!this.playing || this.available() < 2) {
        // Underflow: fade toward silence over a few samples rather than hard-cutting.
        this.last *= 0.9;
        out[i] = Math.abs(this.last) < 1e-4 ? 0 : this.last;
        if (this.playing && this.available() < 2) this.playing = false;
        continue;
      }
      const a = this.buf[this.read];
      const b = this.buf[(this.read + 1) % this.size];
      if (this.gain < 1) this.gain = Math.min(1, this.gain + 1 / 256);
      const v = (a + (b - a) * this.frac) * this.gain * this.hold;
      out[i] = v;
      this.last = v;
      sq += v * v;
      this.frac += this.ratio;
      while (this.frac >= 1) {
        this.frac -= 1;
        this.read = (this.read + 1) % this.size;
      }
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    const mic = inputs[0] && inputs[0][0];
    if (this.barge && mic && mic.length) {
      let m = 0;
      if (!this.muted) for (let i = 0; i < mic.length; i++) m += mic[i] * mic[i];
      this.quietBlocks = sq > 0 ? 0 : this.quietBlocks + 1;
      this.decide(this.barge.step(Math.sqrt(m / mic.length), Math.sqrt(sq / out.length), this.midReply()));
      if (this.debug && this.tick % 4 === 0) {
        const b = this.barge;
        this.port.postMessage({ dbg: [b.mic, b.farMax(), b.threshold(b.farMax()), b.coupling, b.caller, b.floor, b.paused ? 1 : 0].map((v) => +v.toFixed(4)) });
      }
    }
    const speaking = (this.playing || this.available() > 2) && !(this.barge && this.barge.paused);
    if (++this.tick % 8 === 0 || speaking !== this.speaking) {
      // Debounce "stopped speaking" a little so the UI doesn't flicker between chunks.
      if (speaking || this.tick % 8 === 0) {
        this.speaking = speaking;
        this.port.postMessage({ speaking, level: Math.sqrt(sq / out.length) });
      }
    }
    return true;
  }
}
registerProcessor("pcm-player", PcmPlayer);
