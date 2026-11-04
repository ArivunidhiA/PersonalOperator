// Barge-in detector, run inside the player worklet on every 128-sample block.
// It knows exactly what the agent is playing, so it can tell the caller's voice
// from the agent's own echo: echo is the agent's output, delayed and quieter; the
// caller is mic energy that output can't explain. Three cues decide:
// - louder than the echo estimate (output level x learned speaker-to-mic coupling),
// - above the room's noise floor,
// - near the caller's own speaking level, so a TV or voices across the room don't count.
// It pauses within ~30 ms of speech, commits (drops the reply) after ~250 ms of it,
// and resumes if the sound stopped first (a cough, a door, a word from someone else).
// Exposed on globalThis so the player module and the unit tests can both load it.
globalThis.BargeDetector = class BargeDetector {
  constructor(sampleRate, block = 128) {
    this.blockMs = (block / sampleRate) * 1000;
    this.window = Math.ceil(450 / this.blockMs); // echo can trail the output by this much
    this.far = new Float32Array(this.window);
    this.at = 0;
    this.mic = 0; // smoothed mic level
    this.floor = 0.002;
    this.coupling = 0.25;
    this.caller = 0; // the caller's typical speaking level, learned while the agent is quiet
    this.run = 0; // ms of speech in a row
    this.speech = 0; // ms of speech since the pause
    this.quiet = 0; // ms of quiet since the pause
    this.paused = false;
    this.peak = 0; // loudest mic-to-output ratio during a pause, to learn from a false one
    this.sinceVoice = Infinity; // ms since the last block that sounded like the caller
  }
  farMax() {
    let m = 0;
    for (let i = 0; i < this.window; i++) if (this.far[i] > m) m = this.far[i];
    return m;
  }
  threshold(far) {
    return Math.max(0.006, this.floor * 4, this.coupling * far * 3, this.caller * 0.2);
  }
  /** One block. Returns "pause", "resume", "commit" or null. */
  step(micRms, outRms, agentActive) {
    this.far[this.at] = outRms;
    this.at = (this.at + 1) % this.window;
    this.mic += (micRms - this.mic) * 0.25;
    const far = this.farMax();
    const voice = this.mic > this.threshold(far);
    this.sinceVoice = voice ? 0 : this.sinceVoice + this.blockMs;

    if (!voice) {
      const k = this.mic < this.floor ? 0.1 : 0.0005;
      this.floor += (this.mic - this.floor) * k;
    }
    if (far < 0.003 && !this.paused) {
      // Agent quiet: whatever voice the mic carries is the caller's.
      if (this.mic > Math.max(0.01, this.floor * 4)) this.caller = this.caller ? this.caller + (this.mic - this.caller) * 0.005 : this.mic;
    } else if (far > 0.01 && !voice && !this.paused) {
      const r = this.mic / far;
      if (r < this.coupling * 2) this.coupling = Math.min(1.5, Math.max(0.02, this.coupling + (r - this.coupling) * 0.01));
    }

    if (!this.paused) {
      this.run = voice && agentActive ? this.run + this.blockMs : 0;
      if (this.run < 30) return null;
      this.paused = true;
      this.speech = this.run;
      this.quiet = 0;
      this.peak = far > 0 ? this.mic / far : 0;
      return "pause";
    }
    if (voice) {
      this.speech += this.blockMs;
      this.quiet = 0;
      if (far > 0) this.peak = Math.max(this.peak, this.mic / far);
      if (this.speech >= 250) return this.reset("commit");
    } else if ((this.quiet += this.blockMs) >= 350) {
      // It stopped before it could be the caller talking. If it was echo after all, learn the louder coupling.
      if (this.peak > this.coupling * 3 && this.peak < 1.5) this.coupling = Math.min(1.5, this.peak * 0.5);
      return this.reset("resume");
    }
    return null;
  }
  /** The server heard the caller start. Trust it only if this end heard a voice too, not just echo. */
  confirm() {
    return this.paused || this.sinceVoice < 800 ? this.reset("commit") : null;
  }
  reset(result) {
    this.paused = false;
    this.run = this.speech = this.quiet = 0;
    return result;
  }
};
