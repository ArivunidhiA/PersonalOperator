// Playback for Gemini Live: 24 kHz PCM16 chunks -> a ring buffer resampled to the
// context rate. "flush" drops everything queued (barge-in). Posts speaking state
// and output level so the UI can react to the agent's voice.
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(24000 * 180); // 3 min of 24 kHz audio
    this.read = 0;
    this.write = 0;
    this.frac = 0;
    this.ratio = 24000 / sampleRate;
    this.speaking = false;
    this.tick = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d === "flush") {
        this.read = this.write = 0;
        this.frac = 0;
        return;
      }
      if (d && d.pcm) {
        const pcm = new Int16Array(d.pcm);
        for (let i = 0; i < pcm.length; i++) {
          this.buf[this.write] = pcm[i] / 32768;
          this.write = (this.write + 1) % this.buf.length;
        }
      }
    };
  }
  available() {
    return (this.write - this.read + this.buf.length) % this.buf.length;
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    let sq = 0;
    for (let i = 0; i < out.length; i++) {
      if (this.available() < 2) {
        out[i] = 0;
        continue;
      }
      const a = this.buf[this.read];
      const b = this.buf[(this.read + 1) % this.buf.length];
      const v = a + (b - a) * this.frac;
      out[i] = v;
      sq += v * v;
      this.frac += this.ratio;
      while (this.frac >= 1) {
        this.frac -= 1;
        this.read = (this.read + 1) % this.buf.length;
      }
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    const speaking = this.available() > 2;
    if (++this.tick % 8 === 0 || speaking !== this.speaking) {
      this.speaking = speaking;
      this.port.postMessage({ speaking, level: Math.sqrt(sq / out.length) });
    }
    return true;
  }
}
registerProcessor("pcm-player", PcmPlayer);
