import type { AudioEngine } from './AudioEngine';

/**
 * CC0 soundtrack fallback hosted by OpenGameArt.org.
 * "Space Music: Out There" by yd is explicitly marked CC0.
 */
const CC0_SPACE_TRACK_URL = 'https://opengameart.org/sites/default/files/OutThere.ogg';

/** Local soundtrack copied into the GitHub Pages artifact by the deploy workflow. */
const REPO_TRACK_URL = `${import.meta.env.BASE_URL}Midnight_Highway_Run.mp3`;

/**
 * A bundled/imported local track can be added under src/audio/tracks/ and will
 * take precedence. Otherwise use the repository-root soundtrack copied into dist.
 */
const TRACKS = import.meta.glob('./tracks/*.{mp3,ogg,m4a,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const externalTrackUrl = (): string | null => {
  const paths = Object.keys(TRACKS).sort();
  const first = paths[0];
  return first === undefined ? REPO_TRACK_URL : (TRACKS[first] ?? REPO_TRACK_URL);
};

export class TrackMusic {
  readonly source = 'file' as const;

  private element: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;

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
      this.element.preload = 'auto';
    }

    if (this.sourceNode === null) {
      this.sourceNode = ctx.createMediaElementSource(this.element);
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = 0.3;
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(out);
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
