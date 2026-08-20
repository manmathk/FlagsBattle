import type { AudioEngine } from './AudioEngine';
import { STEPS_PER_BAR, tempoFor, voicesFor } from './composition';

/** Root of the key: A2. */
const ROOT_HZ = 110;

/** How far ahead notes are scheduled, in seconds. */
const LOOKAHEAD = 0.25;

const hzFor = (semitone: number): number => ROOT_HZ * Math.pow(2, semitone / 12);

/**
 * Plays the generative score.
 *
 * Notes are scheduled ahead of the clock rather than fired from the frame loop:
 * requestAnimationFrame jitter is inaudible for graphics and very audible for
 * rhythm, so timing comes from the AudioContext clock.
 */
export class GeneratedMusic {
  readonly source = 'generated' as const;

  private step = 0;
  private nextNoteAt = 0;
  private intensity = 0;
  private playing = false;

  constructor(private readonly engine: AudioEngine) {}

  setIntensity(value: number): void {
    this.intensity = value;
  }

  start(): void {
    this.playing = true;
    // Start slightly ahead so the first note is not already late.
    this.nextNoteAt = this.engine.currentTime + 0.1;
  }

  stop(): void {
    this.playing = false;
  }

  /** Call once per frame; schedules whatever falls inside the lookahead window. */
  update(): void {
    if (!this.playing || !this.engine.audible) return;

    const ctx = this.engine.ctx;
    if (ctx === null) return;

    // A long stall (backgrounded tab) leaves nextNoteAt far in the past; catching
    // up note by note would fire hundreds at once, so skip forward instead.
    if (this.nextNoteAt < ctx.currentTime - 1) this.nextNoteAt = ctx.currentTime + 0.05;

    const stepSeconds = 60 / tempoFor(this.intensity) / 2;
    while (this.nextNoteAt < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.step, this.nextNoteAt, stepSeconds);
      this.step = (this.step + 1) % (STEPS_PER_BAR * 64);
      this.nextNoteAt += stepSeconds;
    }
  }

  private scheduleStep(step: number, at: number, stepSeconds: number): void {
    const { bass, arp, perc } = voicesFor({ step, intensity: this.intensity });
    if (bass !== null) {
      this.playTone(hzFor(bass.semitone), bass.velocity, at, bass.durationBeats * stepSeconds, 'triangle', 420);
    }
    if (arp !== null) {
      this.playTone(hzFor(arp.semitone), arp.velocity, at, arp.durationBeats * stepSeconds, 'sawtooth', 2200);
    }
    if (perc !== null) this.playPerc(perc, at);
  }

  private playTone(
    hz: number,
    velocity: number,
    at: number,
    duration: number,
    type: OscillatorType,
    cutoff: number,
  ): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.value = hz;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;

    // Exponential ramps cannot reach zero, hence the tiny floor values.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(velocity * 0.3, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(filter).connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private playPerc(velocity: number, at: number): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.value = 5200;
    filter.type = 'bandpass';
    filter.frequency.value = 6000;

    gain.gain.setValueAtTime(velocity * 0.05, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);

    osc.connect(filter).connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}
