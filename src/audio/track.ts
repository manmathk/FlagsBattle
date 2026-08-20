import type { AudioEngine } from './AudioEngine';

/**
 * Any audio file dropped into `src/audio/tracks/` becomes the soundtrack.
 *
 * Resolved by a build-time glob rather than by probing `public/audio/` at
 * runtime: static hosting has no directory listing, so probing would mean
 * guessing filenames and eating a 404 on every page load. The trade-off is that
 * tracks live under `src/` instead of `public/`.
 */
const TRACKS = import.meta.glob('./tracks/*.{mp3,ogg,m4a,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** URL of the bundled track, or null when none was supplied. */
export const externalTrackUrl = (): string | null => {
  const paths = Object.keys(TRACKS).sort();
  const first = paths[0];
  return first === undefined ? null : (TRACKS[first] ?? null);
};

/**
 * Loops a supplied audio file through the master gain, so the mute control and
 * levels behave identically to the generated soundtrack.
 */
export class TrackMusic {
  readonly source = 'file' as const;

  private element: HTMLAudioElement | null = null;
  private wired = false;

  constructor(
    private readonly engine: AudioEngine,
    private readonly url: string,
  ) {}

  /** A file has fixed dynamics, so intensity does not apply. */
  setIntensity(): void {}

  start(): void {
    const ctx = this.engine.ctx;
    const out = this.engine.destination;
    if (ctx === null || out === null) return;

    if (this.element === null) {
      this.element = new Audio(this.url);
      this.element.loop = true;
      this.element.crossOrigin = 'anonymous';
    }

    if (!this.wired) {
      // A media element source can only be created once per element.
      ctx.createMediaElementSource(this.element).connect(out);
      this.wired = true;
    }

    void this.element.play().catch(() => {
      // Playback can still be refused if this was not reached from a gesture.
    });
  }

  stop(): void {
    this.element?.pause();
  }

  update(): void {}
}
