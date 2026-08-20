/**
 * The score, as pure data.
 *
 * Deliberately deterministic — no randomness anywhere. The soundtrack is a
 * function of (step, intensity), which makes it unit-testable and means the music
 * tracks the round's shape rather than wandering on its own.
 */

/** Minor pentatonic: sparse enough that any two notes together still work. */
export const SCALE: readonly number[] = [0, 3, 5, 7, 10];

/** Root offset per bar, in semitones, relative to the key. */
export const PROGRESSION: readonly number[] = [0, -5, -3, -7];

export const STEPS_PER_BAR = 8;

/** Intensity at which each layer enters, so the arrangement builds. */
export const ARP_THRESHOLD = 0.3;
export const PERC_THRESHOLD = 0.6;

export const TEMPO = { min: 84, max: 132 } as const;

export interface Note {
  /** Semitones relative to the key's root. */
  semitone: number;
  velocity: number;
  durationBeats: number;
}

export interface StepVoices {
  bass: Note | null;
  arp: Note | null;
  /** Percussion is unpitched, so just a velocity. */
  perc: number | null;
}

export interface CompositionParams {
  step: number;
  /** 0 = arena full, 1 = one flag left. */
  intensity: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const tempoFor = (intensity: number): number =>
  TEMPO.min + (TEMPO.max - TEMPO.min) * clamp01(intensity);

export const voicesFor = ({ step, intensity }: CompositionParams): StepVoices => {
  const level = clamp01(intensity);
  const bar = Math.floor(step / STEPS_PER_BAR);
  const beat = step % STEPS_PER_BAR;
  const root = PROGRESSION[bar % PROGRESSION.length]!;

  // Bass anchors the bar and plays at every intensity, so there is always a floor
  // under the mix even with the arena full.
  const onBassBeat = beat === 0 || beat === STEPS_PER_BAR / 2;
  const bass: Note | null = onBassBeat
    ? { semitone: root - 24, velocity: 0.5 + level * 0.2, durationBeats: 1.5 }
    : null;

  // Arpeggio sits off the beat so it interleaves with the bass rather than
  // doubling it. Cycling a 5-note scale against an 8-step bar phases the pattern
  // so it does not repeat every bar.
  const arp: Note | null =
    level >= ARP_THRESHOLD && beat % 2 === 1
      ? {
          semitone: root + SCALE[step % SCALE.length]! + 12,
          velocity: 0.18 + level * 0.22,
          durationBeats: 0.4,
        }
      : null;

  const perc: number | null =
    level >= PERC_THRESHOLD && beat % 2 === 0 ? 0.3 + level * 0.3 : null;

  return { bass, arp, perc };
};
