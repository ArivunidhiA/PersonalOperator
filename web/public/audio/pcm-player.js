// Playback for Gemini Live: 24 kHz PCM16 chunks -> a ring buffer resampled to the
// context rate. "flush" drops everything queued (barge-in). A short pre-roll
// absorbs network jitter; underflow fades out instead of clicking; overflow drops
// the oldest audio. Posts speaking state and output level for the UI.
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
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d === "flush") {
        this.read = this.write = 0;
        this.frac = 0;
        this.playing = false;
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
  available() {
    return (this.write - this.read + this.size) % this.size;
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
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
      const v = (a + (b - a) * this.frac) * this.gain;
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
    const speaking = this.playing || this.available() > 2;
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
