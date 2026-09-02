import { describe, expect, it } from 'vitest';
import { Round } from './Round';
import { NormalMode } from '../modes/NormalMode';
import { LightningMode } from '../modes/LightningMode';
import type { ModeContext } from '../modes/GameMode';
import { bodyRadiusFor, SIM } from '../config';

const codes = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
const DT = SIM.fixedStep;

const TEST_FLAG_COUNT = 40;
const TEST_ARENA_RADIUS = 900;
const TEST_BODY_RADIUS = bodyRadiusFor(TEST_FLAG_COUNT, TEST_ARENA_RADIUS);

const runToEnd = (round: Round, maxSeconds = SIM.roundCapSeconds * 2) => {
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps && round.status === 'running'; i++) round.step(DT);
  return round;
};

describe('Round', () => {
  const createRound = (mode: NormalMode | LightningMode, seed: number) =>
    new Round({
      mode,
      flagCodes: codes(TEST_FLAG_COUNT),
      seed,
      arenaRadius: TEST_ARENA_RADIUS,
    });

  it('puts one body in the arena per flag code', () => {
    const round = createRound(new NormalMode(), 1);
    expect(round.world.bodies).toHaveLength(TEST_FLAG_COUNT);
    expect(round.world.bodies.map((b) => b.flagCode)).toEqual(codes(TEST_FLAG_COUNT));
    expect(round.world.aliveCount).toBe(TEST_FLAG_COUNT);
  });

  it('refuses to start a round that cannot have a winner', () => {
    expect(() => new Round({ mode: new NormalMode(), flagCodes: ['only'], seed: 1 })).toThrow(
      /at least two/i,
    );
  });

  it('gives flags a starting velocity so the pack is never inert', () => {
    const round = createRound(new NormalMode(), 1);
    for (const body of round.world.bodies) {
      const speed = Math.hypot(body.vel.x, body.vel.y);
      expect(speed).toBeGreaterThanOrEqual(SIM.spawnSpeed.min - 0.001);
      expect(speed).toBeLessThanOrEqual(SIM.spawnSpeed.max + 0.001);
    }
  });

  it('resolves with exactly one winner', () => {
    const round = runToEnd(createRound(new NormalMode(), 3));
    expect(round.status).toBe('resolved');
    expect(round.winner).not.toBeNull();
    expect(codes(TEST_FLAG_COUNT)).toContain(round.winner!.flagCode);
  });

  it('produces the same winner for the same seed', () => {
    const a = runToEnd(createRound(new NormalMode(), 77));
    const b = runToEnd(createRound(new NormalMode(), 77));
    expect(a.winner!.flagCode).toBe(b.winner!.flagCode);
    expect(a.elapsed).toBeCloseTo(b.elapsed, 9);
  });

  it('ignores further steps once resolved', () => {
    const round = runToEnd(createRound(new LightningMode(), 5));
    const at = round.elapsed;
    round.step(DT);
    round.step(DT);
    expect(round.elapsed).toBe(at);
  });

  it('does not engage sudden death during a normal-length round', () => {
    const round = createRound(new NormalMode(), 2);
    for (let i = 0; i < 100; i++) round.step(DT);
    expect(round.suddenDeath).toBe(false);
  });

  it('engages sudden death once the cap is passed', () => {
    const stalled = new (class extends NormalMode {
      override onRoundStart(ctx: ModeContext): void {
        ctx.world.arena.radius = TEST_ARENA_RADIUS;
        ctx.world.arena.gap = null;
      }

      override onStep(): void {
        /* sealed, frozen arena: nothing can leave */
      }
    })();
    const round = new Round({
      mode: stalled,
      flagCodes: codes(TEST_FLAG_COUNT),
      seed: 2,
      arenaRadius: TEST_ARENA_RADIUS,
    });
    const steps = Math.round((SIM.roundCapSeconds + 1) / DT);
    for (let i = 0; i < steps && round.status === 'running'; i++) round.step(DT);
    expect(round.suddenDeath).toBe(true);
  });

  it('uses the larger configured production ball radius', () => {
    const productionRadius = bodyRadiusFor(197, SIM.arenaRadius);
    expect(productionRadius).toBeGreaterThan(24);
    expect(TEST_BODY_RADIUS).toBeGreaterThan(24);
  });
});
