// Mic capture for Gemini Live: native-rate float audio -> 16 kHz little-endian PCM16,
// posted in ~32 ms chunks (512 samples). Averages each output sample over its input
// window (a cheap low-pass) so downsampling doesn't alias. Also posts an RMS level.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.acc = 0;
    this.accN = 0;
    this.pos = 0;
    this.out = new Int16Array(512);
    this.n = 0;
    this.muted = false;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.muted === "boolean") this.muted = e.data.muted;
    };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sq = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = this.muted ? 0 : ch[i];
      sq += s * s;
      this.acc += s;
      this.accN++;
      this.pos += 1;
      if (this.pos >= this.step) {
        this.pos -= this.step;
        const v = Math.max(-1, Math.min(1, this.acc / this.accN));
        this.acc = 0;
        this.accN = 0;
        this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === this.out.length) {
          this.port.postMessage({ pcm: this.out.buffer.slice(0), level: Math.sqrt(sq / ch.length) });
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
