import { describe, expect, it } from 'vitest';
import { Round } from './Round';
import { NormalMode } from '../modes/NormalMode';
import { LightningMode } from '../modes/LightningMode';
import { ChaosMode } from '../modes/ChaosMode';
import type { GameMode } from '../modes/GameMode';
import { FLAG_COUNT, SIM } from '../config';

const DT = SIM.fixedStep;
const flagCodes = Array.from({ length: FLAG_COUNT }, (_, i) => `c${i}`);

interface RoundReport {
  round: Round;
  seconds: number;
  steps: number;
  msPerStep: number;
  aliveWasMonotonic: boolean;
  maxDistanceOutsideWall: number;
}

/** Run a full-size round to resolution, gathering the invariants as it goes. */
const playFullRound = (mode: GameMode, seed: number): RoundReport => {
  const round = new Round({ mode, flagCodes, seed });
  const limit = Math.round((SIM.roundCapSeconds * 2) / DT);

  let previousAlive = round.world.aliveCount;
  let aliveWasMonotonic = true;
  let maxDistanceOutsideWall = 0;
  let steps = 0;

  const startedAt = performance.now();
  while (round.status === 'running' && steps < limit) {
    round.step(DT);
    steps++;

    const alive = round.world.aliveCount;
    if (alive > previousAlive) aliveWasMonotonic = false;
    previousAlive = alive;

    // Only meaningful while the ring is closed: with a gap, leaving is the point.
    if (round.world.arena.gap === null) {
      const { center, radius } = round.world.arena;
      for (const body of round.world.bodies) {
        if (body.state !== 'alive') continue;
        const outside =
          Math.hypot(body.pos.x - center.x, body.pos.y - center.y) -
          (radius - round.world.bodyRadius);
        if (outside > maxDistanceOutsideWall) maxDistanceOutsideWall = outside;
      }
    }
  }
  const elapsedMs = performance.now() - startedAt;

  return {
    round,
    seconds: round.elapsed,
    steps,
    msPerStep: elapsedMs / steps,
    aliveWasMonotonic,
    maxDistanceOutsideWall,
  };
};

const modes: Array<[string, () => GameMode]> = [
  ['NormalMode', () => new NormalMode()],
  ['LightningMode', () => new LightningMode()],
  ['ChaosMode', () => new ChaosMode()],
];

describe(`a full ${FLAG_COUNT}-flag round`, () => {
  for (const [name, make] of modes) {
    describe(name, () => {
      const report = playFullRound(make(), 20260820);

      it('terminates', () => {
        expect(report.round.status).toBe('resolved');
      });

      it('finishes inside the round cap', () => {
        // eslint-disable-next-line no-console
        console.log(
          `${name}: resolved in ${report.seconds.toFixed(1)}s ` +
            `(${report.steps} steps, ${report.msPerStep.toFixed(3)} ms/step)`,
        );
        expect(report.seconds).toBeLessThanOrEqual(SIM.roundCapSeconds);
      });

      it('lasts long enough to watch, and not so long it drags', () => {
        // The design target is 45-90s. Guarded with slack either side so seed
        // variance does not make this flaky, while a real regression in drain
        // rate or strike rate still trips it.
        expect(report.seconds).toBeGreaterThan(30);
        expect(report.seconds).toBeLessThan(110);
      });

      it('leaves exactly one winner, drawn from the entrants', () => {
        expect(report.round.winner).not.toBeNull();
        expect(flagCodes).toContain(report.round.winner!.flagCode);
        expect(report.round.world.aliveCount).toBeLessThanOrEqual(1);
      });

      it('never resurrects an eliminated flag', () => {
        expect(report.aliveWasMonotonic).toBe(true);
      });

      it('never lets a flag through a closed ring', () => {
        expect(report.maxDistanceOutsideWall).toBeLessThan(1);
      });

      it('stays inside the per-step time budget', () => {
        // Two steps per frame at 60fps is ~8ms of headroom; 2ms/step leaves room
        // for the renderer and for slower CI hardware.
        expect(report.msPerStep).toBeLessThan(2);
      });

      it('is reproducible from its seed', () => {
        const again = playFullRound(make(), 20260820);
        expect(again.round.winner!.flagCode).toBe(report.round.winner!.flagCode);
        expect(again.steps).toBe(report.steps);
      });
    });
  }
});
