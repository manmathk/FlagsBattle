import { describe, expect, it } from 'vitest';
import { Arena } from './Arena';
import { createBody } from './Body';
import { Rng } from './Rng';
import { World } from './World';
import { vec } from './Vec2';
import type { Vec2 } from './Vec2';

const NO_FORCE = (): Vec2 => vec(0, 0);
const DT = 1 / 120;

const worldWith = (
  bodies: ReturnType<typeof createBody>[],
  opts: { radius?: number; restitution?: number; gap?: null | { centerAngle: number; width: number }; arenaRadius?: number } = {},
) =>
  new World({
    bodies,
    arena: new Arena(vec(0, 0), opts.arenaRadius ?? 200, opts.gap ?? null),
    bodyRadius: opts.radius ?? 10,
    restitution: opts.restitution ?? 0.9,
    maxSpeed: 2000,
    // Friction and spin are exercised in World.friction.test.ts; disabling them
    // here keeps these assertions about normal-direction response alone.
    friction: 0,
    angularRetain: 1,
    maxAngularVel: 100,
  });

const totalMomentum = (w: World) =>
  w.bodies.reduce((acc, b) => ({ x: acc.x + b.vel.x, y: acc.y + b.vel.y }), vec(0, 0));

const totalKineticEnergy = (w: World) =>
  w.bodies.reduce((acc, b) => acc + (b.vel.x * b.vel.x + b.vel.y * b.vel.y) / 2, 0);

describe('World', () => {
  describe('body-body collision', () => {
    it('conserves momentum in a head-on collision', () => {
      // Placed overlapping (centres 15 apart, diameter 20) so they resolve this step.
      const w = worldWith([
        createBody(0, 'aa', vec(-7.5, 0), vec(100, 0)),
        createBody(1, 'bb', vec(7.5, 0), vec(-60, 0)),
      ]);
      const before = totalMomentum(w);
      w.step(DT, NO_FORCE);
      const after = totalMomentum(w);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    });

    it('conserves kinetic energy when perfectly elastic', () => {
      const w = worldWith(
        [
          createBody(0, 'aa', vec(-7.5, 0), vec(100, 0)),
          createBody(1, 'bb', vec(7.5, 0), vec(-60, 0)),
        ],
        { restitution: 1 },
      );
      const before = totalKineticEnergy(w);
      w.step(DT, NO_FORCE);
      expect(totalKineticEnergy(w)).toBeCloseTo(before, 6);
    });

    it('transfers all velocity in a perfectly elastic hit on a body at rest', () => {
      const w = worldWith(
        [
          createBody(0, 'aa', vec(-7.5, 0), vec(100, 0)),
          createBody(1, 'bb', vec(7.5, 0), vec(0, 0)),
        ],
        { restitution: 1 },
      );
      w.step(DT, NO_FORCE);
      expect(w.bodies[0]!.vel.x).toBeCloseTo(0, 6);
      expect(w.bodies[1]!.vel.x).toBeCloseTo(100, 6);
    });

    it('loses energy when inelastic, and never gains any', () => {
      const w = worldWith(
        [
          createBody(0, 'aa', vec(-7.5, 0), vec(100, 0)),
          createBody(1, 'bb', vec(7.5, 0), vec(-60, 0)),
        ],
        { restitution: 0.5 },
      );
      const before = totalKineticEnergy(w);
      w.step(DT, NO_FORCE);
      expect(totalKineticEnergy(w)).toBeLessThan(before);
    });

    it('does not resolve bodies that are already separating', () => {
      const w = worldWith([
        createBody(0, 'aa', vec(-7.5, 0), vec(-50, 0)),
        createBody(1, 'bb', vec(7.5, 0), vec(50, 0)),
      ]);
      w.step(DT, NO_FORCE);
      expect(w.bodies[0]!.vel.x).toBeCloseTo(-50, 6);
      expect(w.bodies[1]!.vel.x).toBeCloseTo(50, 6);
    });

    it('pushes overlapping bodies apart', () => {
      const w = worldWith([
        createBody(0, 'aa', vec(-2, 0), vec(0, 0)),
        createBody(1, 'bb', vec(2, 0), vec(0, 0)),
      ]);
      const gapBefore = Math.abs(w.bodies[1]!.pos.x - w.bodies[0]!.pos.x);
      for (let i = 0; i < 30; i++) w.step(DT, NO_FORCE);
      expect(Math.abs(w.bodies[1]!.pos.x - w.bodies[0]!.pos.x)).toBeGreaterThan(gapBefore);
    });

    it('emits a collision event on impact', () => {
      const w = worldWith([
        createBody(0, 'aa', vec(-7.5, 0), vec(100, 0)),
        createBody(1, 'bb', vec(7.5, 0), vec(-60, 0)),
      ]);
      w.step(DT, NO_FORCE);
      expect(w.drainEvents().some((e) => e.type === 'collision')).toBe(true);
    });
  });

  describe('containment', () => {
    it('keeps a body inside a closed ring under heavy gravity', () => {
      const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(400, 0))]);
      const gravity = (): Vec2 => vec(0, 3000);

      for (let i = 0; i < 3000; i++) {
        w.step(DT, gravity);
        const b = w.bodies[0]!;
        expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThanOrEqual(200 - 10 + 0.001);
        expect(b.state).toBe('alive');
      }
    });

    it('clamps speed to maxSpeed', () => {
      const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(0, 0))]);
      const hugeForce = (): Vec2 => vec(500000, 0);
      w.step(DT, hugeForce);
      expect(Math.hypot(w.bodies[0]!.vel.x, w.bodies[0]!.vel.y)).toBeLessThanOrEqual(2000.0001);
    });

    it('stays finite in a dense pack over many steps', () => {
      const rng = new Rng(31);
      const bodies = Array.from({ length: 80 }, (_, i) => {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0, 150);
        return createBody(i, 'aa', vec(Math.cos(a) * r, Math.sin(a) * r), vec(rng.range(-300, 300), rng.range(-300, 300)));
      });
      const w = worldWith(bodies, { restitution: 0.9 });
      const before = totalKineticEnergy(w);

      for (let i = 0; i < 1200; i++) w.step(DT, NO_FORCE);

      const after = totalKineticEnergy(w);
      expect(Number.isFinite(after)).toBe(true);
      // No gravity and restitution < 1, so the pack must cool, never boil.
      expect(after).toBeLessThan(before);
      for (const b of w.bodies) {
        expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThanOrEqual(200 - 10 + 0.001);
      }
    });
  });

  describe('escape through the gap', () => {
    it('marks a body falling when it exits through the gap, then eliminates it', () => {
      // Gap centred on +x; body fired straight at it.
      const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(600, 0))], {
        gap: { centerAngle: 0, width: 1.2 },
      });

      let sawFalling = false;
      for (let i = 0; i < 400; i++) {
        w.step(DT, NO_FORCE);
        if (w.bodies[0]!.state === 'falling') sawFalling = true;
        if (w.bodies[0]!.state === 'eliminated') break;
      }

      expect(sawFalling).toBe(true);
      expect(w.bodies[0]!.state).toBe('eliminated');
      expect(w.aliveCount).toBe(0);
    });

    it('emits an elimination event carrying the body id', () => {
      const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(600, 0))], {
        gap: { centerAngle: 0, width: 1.2 },
      });
      const seen: number[] = [];
      for (let i = 0; i < 400; i++) {
        w.step(DT, NO_FORCE);
        for (const e of w.drainEvents()) if (e.type === 'eliminated') seen.push(e.bodyId);
      }
      expect(seen).toEqual([0]);
    });

    it('bounces instead of escaping when the gap is elsewhere', () => {
      const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(600, 0))], {
        gap: { centerAngle: Math.PI, width: 0.4 },
      });
      for (let i = 0; i < 120; i++) w.step(DT, NO_FORCE);
      expect(w.bodies[0]!.state).toBe('alive');
    });

    it('records elimination order so the last survivor is well defined', () => {
      const w = worldWith(
        [createBody(0, 'aa', vec(0, 0), vec(600, 0)), createBody(1, 'bb', vec(0, 20), vec(0, 0))],
        { gap: { centerAngle: 0, width: 1.2 } },
      );
      for (let i = 0; i < 400; i++) w.step(DT, NO_FORCE);
      expect(w.bodies[0]!.eliminatedAtStep).toBeGreaterThan(0);
      expect(w.bodies[1]!.eliminatedAtStep).toBe(-1);
      expect(w.aliveCount).toBe(1);
    });
  });

  describe('eliminate', () => {
    it('removes a body immediately and emits an event', () => {
      const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(0, 0)), createBody(1, 'bb', vec(50, 0), vec(0, 0))]);
      w.eliminate(w.bodies[0]!);
      expect(w.bodies[0]!.state).toBe('eliminated');
      expect(w.aliveCount).toBe(1);
      expect(w.drainEvents().some((e) => e.type === 'eliminated' && e.bodyId === 0)).toBe(true);
    });

    it('leaves eliminated bodies out of collision handling', () => {
      const w = worldWith([
        createBody(0, 'aa', vec(-7.5, 0), vec(100, 0)),
        createBody(1, 'bb', vec(7.5, 0), vec(0, 0)),
      ]);
      w.eliminate(w.bodies[1]!);
      w.drainEvents();
      w.step(DT, NO_FORCE);
      // Body 0 sails on untouched.
      expect(w.bodies[0]!.vel.x).toBeCloseTo(100, 6);
    });
  });

  describe('drainEvents', () => {
    it('empties the queue so events are consumed once', () => {
      const w = worldWith([createBody(0, 'aa', vec(0, 0), vec(0, 0))]);
      w.eliminate(w.bodies[0]!);
      expect(w.drainEvents()).toHaveLength(1);
      expect(w.drainEvents()).toHaveLength(0);
    });
  });
});
