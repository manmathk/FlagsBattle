import type { AudioEngine } from './AudioEngine';

/**
 * CC0 soundtrack hosted by OpenGameArt.org.
 * "Space Music: Out There" by yd is explicitly marked CC0 and is a 4-minute
 * background loop, making it a good fit for the spinning arena battle.
 * Source: https://opengameart.org/content/space-music-out-there
 */
const CC0_SPACE_TRACK_URL = 'https://opengameart.org/sites/default/files/OutThere.ogg';

/**
 * A local track takes precedence when one is supplied under src/audio/tracks/.
 * Otherwise use the verified CC0 OpenGameArt track.
 */
const TRACKS = import.meta.glob('./tracks/*.{mp3,ogg,m4a,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const externalTrackUrl = (): string | null => {
  const paths = Object.keys(TRACKS).sort();
  const first = paths[0];
  return first === undefined ? CC0_SPACE_TRACK_URL : (TRACKS[first] ?? CC0_SPACE_TRACK_URL);
};

export class TrackMusic {
  readonly source = 'file' as const;

  private element: HTMLAudioElement | null = null;
  private wired = false;

  constructor(
    private readonly engine: AudioEngine,
    private readonly url: string,
  ) {}

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
      ctx.createMediaElementSource(this.element).connect(out);
      this.wired = true;
    }

    void this.element.play().catch(() => {
      // Browser autoplay policy may require the user to press the sound control.
    });
  }

  stop(): void {
    this.element?.pause();
  }

  update(): void {}
}
