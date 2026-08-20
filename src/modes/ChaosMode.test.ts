import { describe, expect, it } from 'vitest';
import { ChaosMode, CHAOS } from './ChaosMode';
import { makeWorld, runMode } from '../test/fixture';
import type { ChaosEventKind } from '../core/World';
import { ORBIT, SIM } from '../config';
import { orbitalForce } from '../core/forces';
import { Rng } from '../core/Rng';
import { vec, type Vec2 } from '../core/Vec2';

/**
 * Advance until the named chaos event is active, then sample the force applied to
 * a body parked 200px to the +x side of the arena centre.
 *
 * Chaos events stack on top of the shared orbital field, so the baseline is
 * returned alongside: what the event contributes is the difference between them.
 */
const sampleForceDuring = (
  kind: ChaosEventKind,
): { total: Vec2; base: Vec2 } | null => {
  const mode = new ChaosMode();
  const world = makeWorld(20, mode);
  let sample: { total: Vec2; base: Vec2 } | null = null;
  runMode(mode, world, 300, {
    onStep: ({ world: w }) => {
      if (sample !== null || mode.activeEvent?.kind !== kind) return;
      const body = w.bodies[0]!;
      body.pos = vec(w.arena.center.x + 200, w.arena.center.y);
      sample = {
        total: mode.gravity(body, 0, w.arena),
        base: orbitalForce(body.pos, w.arena.center, ORBIT),
      };
    },
  });
  return sample;
};

describe('ChaosMode', () => {
  it('does not run a series', () => {
    expect(new ChaosMode().usesSeries).toBe(false);
  });

  it('opens a gap, so shrinking has somewhere to push flags', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 1);
    expect(world.arena.gap).not.toBeNull();
  });

  it('holds the arena steady before the shrink delay', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, CHAOS.shrinkDelay - 1);
    expect(world.arena.radius).toBeCloseTo(SIM.arenaRadius, 5);
  });

  it('shrinks the arena after the delay', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, CHAOS.shrinkDelay + 10);
    expect(world.arena.radius).toBeLessThan(SIM.arenaRadius);
    expect(world.arena.radius).toBeCloseTo(SIM.arenaRadius - CHAOS.shrinkRate * 10, 0);
  });

  it('never shrinks past its floor', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 400);
    expect(world.arena.radius).toBe(CHAOS.minRadius);
  });

  it('shrinks faster under sudden death', () => {
    const calm = new ChaosMode();
    const calmWorld = makeWorld(20, calm);
    runMode(calm, calmWorld, CHAOS.shrinkDelay + 10);

    const rushed = new ChaosMode();
    const rushedWorld = makeWorld(20, rushed);
    runMode(rushed, rushedWorld, CHAOS.shrinkDelay + 10, { suddenDeath: true });

    expect(rushedWorld.arena.radius).toBeLessThan(calmWorld.arena.radius);
  });

  it('drifts the arena centre away from the origin', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    let maxDrift = 0;
    runMode(mode, world, 40, {
      onStep: ({ world: w }) => {
        maxDrift = Math.max(maxDrift, Math.hypot(w.arena.center.x, w.arena.center.y));
      },
    });
    expect(maxDrift).toBeGreaterThan(20);
    expect(maxDrift).toBeLessThanOrEqual(CHAOS.driftAmplitude * Math.SQRT2 + 0.001);
  });

  it('announces each chaos event', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 40);
    const kinds = world.drainEvents().flatMap((e) => (e.type === 'chaosEvent' ? [e.kind] : []));
    expect(kinds.length).toBeGreaterThan(2);
  });

  it('fires all four kinds of event over a long run', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 400);
    const kinds = new Set(
      world.drainEvents().flatMap((e) => (e.type === 'chaosEvent' ? [e.kind] : [])),
    );
    expect([...kinds].sort()).toEqual(['chaosSpin', 'speedBurst', 'vortex', 'wind']);
  });

  it('applies the bare orbital field when no event is active', () => {
    const mode = new ChaosMode();
    const world = makeWorld(20, mode);
    mode.onRoundStart({ world, rng: new Rng(1), t: 0, suddenDeath: false });

    const body = world.bodies[0]!;
    body.pos = vec(200, 0);
    const g = mode.gravity(body, 0, world.arena);
    expect(g.x).toBeCloseTo(-ORBIT.centripetal, 6);
    expect(Math.abs(g.y)).toBeCloseTo(ORBIT.tangential, 6);
  });

  describe('vortex', () => {
    it('deepens the inward pull beyond the orbital baseline', () => {
      const sample = sampleForceDuring('vortex');
      expect(sample).not.toBeNull();
      // The body sits to the +x side of centre, so the extra pull is -x.
      expect(sample!.total.x - sample!.base.x).toBeCloseTo(-CHAOS.vortexAccel, 3);
    });
  });

  describe('wind', () => {
    it('adds a uniform push on top of the orbital field', () => {
      const sample = sampleForceDuring('wind');
      expect(sample).not.toBeNull();
      const dx = sample!.total.x - sample!.base.x;
      const dy = sample!.total.y - sample!.base.y;
      expect(Math.hypot(dx, dy)).toBeCloseTo(CHAOS.windAccel, 3);
    });
  });

  describe('chaosSpin', () => {
    it('adds a force perpendicular to the radius', () => {
      const sample = sampleForceDuring('chaosSpin');
      expect(sample).not.toBeNull();
      // For a body on the +x axis a tangential push is purely vertical.
      expect(Math.abs(sample!.total.x - sample!.base.x)).toBeLessThan(1);
      expect(Math.abs(sample!.total.y - sample!.base.y)).toBeCloseTo(CHAOS.spinAccel, 3);
    });
  });

  describe('speedBurst', () => {
    it('raises the speed of the field when it fires', () => {
      const mode = new ChaosMode();
      const world = makeWorld(20, mode);
      for (const b of world.bodies) b.vel = vec(100, 0);
      const baseline = world.bodies.length * 100;

      let peak = baseline;
      runMode(mode, world, 300, {
        onStep: ({ world: w }) => {
          const total = w.bodies.reduce((acc, b) => acc + Math.hypot(b.vel.x, b.vel.y), 0);
          peak = Math.max(peak, total);
        },
      });
      expect(peak).toBeGreaterThan(baseline * 1.5);
    });
  });
});
