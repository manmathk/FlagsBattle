import { describe, expect, it } from 'vitest';
import { Arena } from './Arena';
import { createBody, type Body } from './Body';
import { vec, type Vec2 } from './Vec2';
import { World } from './World';

const NO_FORCE = (): Vec2 => vec(0, 0);
const DT = 1 / 120;
const RADIUS = 10;

const worldWith = (
  bodies: Body[],
  opts: { friction?: number; restitution?: number; angularRetain?: number; maxAngularVel?: number } = {},
) =>
  new World({
    bodies,
    arena: new Arena(vec(0, 0), 200, null),
    bodyRadius: RADIUS,
    restitution: opts.restitution ?? 0.9,
    maxSpeed: 2000,
    friction: opts.friction ?? 0.35,
    angularRetain: opts.angularRetain ?? 0.6,
    maxAngularVel: opts.maxAngularVel ?? 14,
  });

/** Sum of linear and rotational kinetic energy. Discs: I = ½mr², m = 1. */
const totalEnergy = (w: World) =>
  w.bodies.reduce((acc, b) => {
    const linear = (b.vel.x * b.vel.x + b.vel.y * b.vel.y) / 2;
    const rotational = (0.5 * RADIUS * RADIUS * b.angularVel * b.angularVel) / 2;
    return acc + linear + rotational;
  }, 0);

describe('World rotation', () => {
  it('advances angle by angular velocity', () => {
    const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(0, 0))], { angularRetain: 1 });
    w.bodies[0]!.angularVel = 2;
    for (let i = 0; i < 120; i++) w.step(DT, NO_FORCE);
    expect(w.bodies[0]!.angle).toBeCloseTo(2, 1);
  });

  it('starts bodies unspun', () => {
    const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(0, 0))]);
    expect(w.bodies[0]!.angularVel).toBe(0);
  });

  it('bleeds spin away over time', () => {
    const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(0, 0))], { angularRetain: 0.5 });
    w.bodies[0]!.angularVel = 10;
    for (let i = 0; i < 120; i++) w.step(DT, NO_FORCE);
    // One second at 0.5 retention per second.
    expect(w.bodies[0]!.angularVel).toBeCloseTo(5, 1);
  });

  it('never spins faster than the cap, so sprites cannot strobe', () => {
    const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(0, 0))], { maxAngularVel: 6 });
    w.bodies[0]!.angularVel = 500;
    w.step(DT, NO_FORCE);
    expect(Math.abs(w.bodies[0]!.angularVel)).toBeLessThanOrEqual(6);
  });
});

describe('World contact friction', () => {
  describe('against the wall', () => {
    /** A body pressed into the +x wall while sliding along it in +y. */
    const slidingOnWall = (friction: number) => {
      const w = worldWith([createBody(0, 'aa', vec(195, 0), vec(100, 400))], {
        friction,
        maxAngularVel: 100,
      });
      w.step(DT, NO_FORCE);
      return w.bodies[0]!;
    };

    it('spins a sliding body up — flags roll along the wall', () => {
      expect(slidingOnWall(0.35).angularVel).not.toBe(0);
    });

    it('spins it the way the slide implies', () => {
      // Sliding in +y along the +x wall: the contact drags the near side back.
      expect(slidingOnWall(0.35).angularVel).toBeLessThan(0);
    });

    it('generates no spin at all with friction disabled', () => {
      expect(slidingOnWall(0).angularVel).toBe(0);
    });

    it('spins up more with a grippier surface', () => {
      expect(Math.abs(slidingOnWall(0.6).angularVel)).toBeGreaterThan(
        Math.abs(slidingOnWall(0.2).angularVel),
      );
    });

    it('does not fling the body along the wall', () => {
      // Friction can only oppose sliding, never drive it.
      const before = 400;
      expect(slidingOnWall(0.35).vel.y).toBeLessThan(before);
    });
  });

  describe('between two bodies', () => {
    /** Head-on: no tangential relative velocity at the contact. */
    const headOn = () => {
      const w = worldWith([
        createBody(0, 'aa', vec(-7.5, 0), vec(100, 0)),
        createBody(1, 'bb', vec(7.5, 0), vec(-100, 0)),
      ]);
      w.step(DT, NO_FORCE);
      return w;
    };

    /**
     * Glancing: the pair closes along the normal *and* slides across it. The
     * normal component has to dominate, or after one integration step the pair is
     * already separating and the solver correctly ignores them.
     */
    const glancing = (friction = 0.35) => {
      const w = worldWith(
        [
          createBody(0, 'aa', vec(-7.5, 0), vec(300, 200)),
          createBody(1, 'bb', vec(7.5, 0), vec(-300, -200)),
        ],
        { friction, maxAngularVel: 100 },
      );
      w.step(DT, NO_FORCE);
      return w;
    };

    it('imparts no spin in a purely head-on hit', () => {
      const w = headOn();
      expect(w.bodies[0]!.angularVel).toBeCloseTo(0, 9);
      expect(w.bodies[1]!.angularVel).toBeCloseTo(0, 9);
    });

    it('spins both bodies in a glancing hit', () => {
      const w = glancing();
      expect(w.bodies[0]!.angularVel).not.toBe(0);
      expect(w.bodies[1]!.angularVel).not.toBe(0);
    });

    it('spins both the same way, as rubbing discs do', () => {
      const w = glancing();
      expect(Math.sign(w.bodies[0]!.angularVel)).toBe(Math.sign(w.bodies[1]!.angularVel));
    });

    it('still conserves linear momentum', () => {
      // Friction is an equal-and-opposite impulse pair like any other.
      const w = glancing();
      const px = w.bodies[0]!.vel.x + w.bodies[1]!.vel.x;
      const py = w.bodies[0]!.vel.y + w.bodies[1]!.vel.y;
      expect(px).toBeCloseTo(0, 6);
      expect(py).toBeCloseTo(0, 6);
    });

    it('never adds energy, counting spin', () => {
      const before = worldWith([
        createBody(0, 'aa', vec(-7.5, 0), vec(300, 200)),
        createBody(1, 'bb', vec(7.5, 0), vec(-300, -200)),
      ]);
      const initial = totalEnergy(before);
      expect(totalEnergy(glancing())).toBeLessThanOrEqual(initial + 1e-6);
    });

    it('obeys the Coulomb limit rather than reversing the slide', () => {
      // An absurd friction coefficient must still only ever stop sliding, not
      // drive it backwards.
      const w = glancing(50);
      const relTangentialAfter = w.bodies[1]!.vel.y - w.bodies[0]!.vel.y;
      // Started at -400 (b moving -y relative to a); friction may reduce that
      // toward zero but must never drive it positive.
      expect(relTangentialAfter).toBeLessThanOrEqual(0);
    });
  });
});
