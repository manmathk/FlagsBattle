import { describe, expect, it } from 'vitest';
import {
  ARP_THRESHOLD,
  PERC_THRESHOLD,
  PROGRESSION,
  SCALE,
  STEPS_PER_BAR,
  tempoFor,
  TEMPO,
  voicesFor,
} from './composition';

describe('tempoFor', () => {
  it('sits at the slow end when the arena is full', () => {
    expect(tempoFor(0)).toBe(TEMPO.min);
  });

  it('reaches the fast end when one flag remains', () => {
    expect(tempoFor(1)).toBe(TEMPO.max);
  });

  it('rises monotonically with intensity', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const bpm = tempoFor(i / 10);
      expect(bpm).toBeGreaterThan(previous);
      previous = bpm;
    }
  });

  it('clamps intensity outside 0..1 rather than running away', () => {
    expect(tempoFor(-5)).toBe(TEMPO.min);
    expect(tempoFor(9)).toBe(TEMPO.max);
  });
});

describe('voicesFor', () => {
  it('is deterministic — no randomness in the score', () => {
    for (const step of [0, 1, 7, 33, 128]) {
      expect(voicesFor({ step, intensity: 0.5 })).toEqual(voicesFor({ step, intensity: 0.5 }));
    }
  });

  describe('bass', () => {
    it('lands on the first and mid beat of every bar', () => {
      for (let bar = 0; bar < 4; bar++) {
        const base = bar * STEPS_PER_BAR;
        expect(voicesFor({ step: base, intensity: 0 }).bass).not.toBeNull();
        expect(voicesFor({ step: base + STEPS_PER_BAR / 2, intensity: 0 }).bass).not.toBeNull();
      }
    });

    it('stays silent off those beats', () => {
      expect(voicesFor({ step: 1, intensity: 1 }).bass).toBeNull();
      expect(voicesFor({ step: 3, intensity: 1 }).bass).toBeNull();
    });

    it('plays even at zero intensity, so there is always a floor', () => {
      expect(voicesFor({ step: 0, intensity: 0 }).bass).not.toBeNull();
    });

    it('follows the chord progression bar by bar', () => {
      const roots = PROGRESSION.map(
        (_, bar) => voicesFor({ step: bar * STEPS_PER_BAR, intensity: 0 }).bass!.semitone,
      );
      // Distinct roots, and the cycle repeats after the progression length.
      expect(new Set(roots).size).toBe(new Set(PROGRESSION).size);
      const afterCycle = voicesFor({
        step: PROGRESSION.length * STEPS_PER_BAR,
        intensity: 0,
      }).bass!.semitone;
      expect(afterCycle).toBe(roots[0]);
    });
  });

  describe('arpeggio', () => {
    it('stays out until the field has thinned', () => {
      expect(voicesFor({ step: 1, intensity: ARP_THRESHOLD - 0.01 }).arp).toBeNull();
    });

    it('comes in at the threshold', () => {
      expect(voicesFor({ step: 1, intensity: ARP_THRESHOLD }).arp).not.toBeNull();
    });

    it('plays off the beat, against the bass', () => {
      expect(voicesFor({ step: 0, intensity: 1 }).arp).toBeNull();
      expect(voicesFor({ step: 1, intensity: 1 }).arp).not.toBeNull();
    });

    it('only ever uses notes from the scale', () => {
      for (let step = 0; step < 200; step++) {
        const arp = voicesFor({ step, intensity: 1 }).arp;
        if (arp === null) continue;
        // Reduce to a pitch class and check it is in the scale relative to the bar root.
        const bar = Math.floor(step / STEPS_PER_BAR);
        const root = PROGRESSION[bar % PROGRESSION.length]!;
        const degree = (((arp.semitone - root) % 12) + 12) % 12;
        expect(SCALE).toContain(degree);
      }
    });
  });

  describe('percussion', () => {
    it('holds back until high intensity', () => {
      expect(voicesFor({ step: 0, intensity: PERC_THRESHOLD - 0.01 }).perc).toBeNull();
    });

    it('drives on the beat once it arrives', () => {
      expect(voicesFor({ step: 0, intensity: 1 }).perc).not.toBeNull();
      expect(voicesFor({ step: 1, intensity: 1 }).perc).toBeNull();
    });
  });

  it('keeps every velocity within a usable range', () => {
    for (let step = 0; step < 64; step++) {
      for (const intensity of [0, 0.5, 1]) {
        const voices = voicesFor({ step, intensity });
        for (const velocity of [voices.bass?.velocity, voices.arp?.velocity, voices.perc]) {
          if (velocity === undefined || velocity === null) continue;
          expect(velocity).toBeGreaterThan(0);
          expect(velocity).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
