import type { AudioEngine } from './AudioEngine';
import { GeneratedMusic } from './music';
import { externalTrackUrl, TrackMusic } from './track';

export interface Soundtrack {
  readonly source: 'file' | 'generated';
  start(): void;
  stop(): void;
  setIntensity(value: number): void;
  update(): void;
}

/**
 * A supplied file wins if there is one; otherwise the generative score plays, so
 * the page always has music without shipping any audio of its own.
 */
export const createSoundtrack = (engine: AudioEngine): Soundtrack => {
  const url = externalTrackUrl();
  return url === null ? new GeneratedMusic(engine) : new TrackMusic(engine, url);
};
