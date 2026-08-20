import type { AudioEngine } from './AudioEngine';

/**
 * Synthesised one-shots. No audio files, so nothing to licence and nothing to
 * download — every sound here is built from oscillators and a noise buffer.
 */
export class Sfx {
  private noise: AudioBuffer | null = null;

  constructor(private readonly engine: AudioEngine) {}

  /** @param strength 0..1, from the collision's closing speed. */
  impact(strength: number): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null || !this.engine.audible) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    // Harder hits ring higher, which reads as "heavier" against the drone.
    osc.frequency.setValueAtTime(180 + strength * 420, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.09);

    gain.gain.setValueAtTime(0.05 + strength * 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  elimination(): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null || !this.engine.audible) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.28);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  lightning(): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null || !this.engine.audible) return;

    const now = ctx.currentTime;

    // Crack: filtered noise sweeping down.
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(5000, now);
    filter.frequency.exponentialRampToValueAtTime(700, now + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    source.connect(filter).connect(gain).connect(out);
    source.start(now);
    source.stop(now + 0.36);

    // Body: a low thump underneath it.
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    boomGain.gain.setValueAtTime(0.22, now);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    boom.connect(boomGain).connect(out);
    boom.start(now);
    boom.stop(now + 0.46);
  }

  chaosEvent(): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null || !this.engine.audible) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.45);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.51);
  }

  /** Rising arpeggio; longer and higher when a series is decided. */
  winner(isChampion: boolean): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null || !this.engine.audible) return;

    const now = ctx.currentTime;
    const degrees = isChampion ? [0, 4, 7, 12, 16, 19] : [0, 4, 7, 12];

    degrees.forEach((semitone, index) => {
      const at = now + index * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.value = 293.66 * Math.pow(2, semitone / 12); // from D4
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.14, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);

      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + 0.44);
    });
  }

  /** One second of white noise, built once and reused. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise !== null) return this.noise;

    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }
}
