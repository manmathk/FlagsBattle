/** Master level when unmuted. Deliberately conservative for a page that autoplays. */
const MASTER_GAIN = 0.8;
const RAMP_SECONDS = 0.25;

/**
 * Owns the AudioContext.
 *
 * The context is created inside `unlock`, not in the constructor, because
 * browsers refuse to start audio outside a user gesture. Everything downstream
 * therefore has to cope with there being no context yet.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private mutedState = true;

  get muted(): boolean {
    return this.mutedState;
  }

  get ready(): boolean {
    return this.context !== null;
  }

  get ctx(): AudioContext | null {
    return this.context;
  }

  /** Node everything should connect to. Null until unlocked. */
  get destination(): GainNode | null {
    return this.master;
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /** Must be called from within a user gesture (a click), or the context stays suspended. */
  async unlock(): Promise<void> {
    if (this.context === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;

      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === 'suspended') await this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.mutedState = muted;
    if (this.context === null || this.master === null) return;

    // Ramp rather than snap: an instant gain change on a running oscillator
    // produces an audible click.
    const target = muted ? 0 : MASTER_GAIN;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, RAMP_SECONDS / 3);
  }

  /** True when sound should actually be produced. */
  get audible(): boolean {
    return this.context !== null && this.master !== null && !this.mutedState;
  }
}
