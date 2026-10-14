// Rain and thunder, synthesized with the Web Audio API. Off until the listener turns it on.
export class RainSound {
  private ctx: AudioContext | null = null;
  private bed: GainNode | null = null;
  private patter: GainNode | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private dripTimer = 0;
  on = false;

  private start() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    // Two seconds of brown-ish noise, looped, is the raw material for everything.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) { last = (last + 0.035 * (Math.random() * 2 - 1)) / 1.035; data[i] = last * 3.2 + (Math.random() * 2 - 1) * 0.12; }
    this.noise = buffer;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // The steady hiss of rain on glass and the street.
    const bedSource = ctx.createBufferSource();
    bedSource.buffer = buffer; bedSource.loop = true;
    const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 1400; band.Q.value = 0.4;
    this.bed = ctx.createGain();
    bedSource.connect(band).connect(this.bed).connect(this.master);
    bedSource.start();
    // A low wash underneath for heavy rain.
    const lowSource = ctx.createBufferSource();
    lowSource.buffer = buffer; lowSource.loop = true; lowSource.playbackRate.value = 0.7;
    const low = ctx.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 420;
    this.patter = ctx.createGain();
    lowSource.connect(low).connect(this.patter).connect(this.master);
    lowSource.start();
  }

  async toggle() {
    if (!this.ctx) this.start();
    this.on = !this.on;
    if (this.on) await this.ctx!.resume();
    this.master!.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx!.currentTime, 0.4);
    return this.on;
  }

  /** Called every frame with the rain setting; adds the odd tick of a drop on the pane. */
  update(dt: number, rain: number) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.bed!.gain.setTargetAtTime(0.05 + 0.32 * rain, t, 0.5);
    this.patter!.gain.setTargetAtTime(0.02 + 0.35 * rain * rain, t, 0.5);
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 0.04 + Math.random() * (0.6 - 0.5 * rain);
      this.tick(0.03 + Math.random() * 0.06 * (0.4 + rain));
    }
  }

  private tick(volume: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.playbackRate.value = 1.5 + Math.random();
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2500 + Math.random() * 3500; f.Q.value = 3;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5, 0.08);
  }

  /** Thunder after a flash: the farther the strike, the longer the wait and the softer the roll. */
  thunder(distance: number) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.4 + distance * 2.6;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(900 - distance * 400, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.6 - distance * 0.9, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + 6.2);
  }
}
