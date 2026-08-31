import { describe, expect, it } from 'vitest';
import { NormalMode, NORMAL } from './NormalMode';
import { makeWorld, runMode } from '../test/fixture';
import { vec } from '../core/Vec2';
import { ORBIT, SIM } from '../config';

describe('NormalMode', () => {
  it('runs a series and is the only mode that does', () => {
    expect(new NormalMode().usesSeries).toBe(true);
  });

  it('orbits flags around the centre rather than dropping them', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    const body = world.bodies[0]!;
    body.pos = vec(200, 0);

    const g = mode.gravity(body, 0, world.arena);
    expect(g.x).toBeCloseTo(-ORBIT.centripetal, 6);
    expect(Math.abs(g.y)).toBeCloseTo(ORBIT.tangential, 6);
  });

  it('applies the same field strength anywhere in the arena', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    const body = world.bodies[0]!;
    const expected = Math.hypot(ORBIT.centripetal, ORBIT.tangential);

    for (const pos of [vec(30, 0), vec(0, 300), vec(-420, 60)]) {
      body.pos = pos;
      const g = mode.gravity(body, 0, world.arena);
      expect(Math.hypot(g.x, g.y)).toBeCloseTo(expected, 6);
    }
  });

  it('keeps holes closed for the first five seconds', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, NORMAL.holeDelaySeconds - 0.01);
    expect(world.arena.gap).toBeNull();
  });

  it('opens a gap after the five-second countdown', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, NORMAL.holeDelaySeconds + 0.1);
    expect(world.arena.gap).not.toBeNull();
    expect(world.arena.gap!.width).toBe(NORMAL.gapWidth);
    expect(world.arena.gap!.width).toBeGreaterThan(0);
    expect(world.arena.gap!.width).toBeLessThan(Math.PI);
  });

  it('rotates the gap all the way around', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    const seen = new Set<string>();
    const fullRevolution = NORMAL.holeDelaySeconds + (Math.PI * 2) / NORMAL.gapRotation + 1;
    runMode(mode, world, fullRevolution, {
      onStep: ({ world: w }) => {
        if (w.arena.gap === null) return;
        const a = w.arena.gap.centerAngle;
        seen.add(String(Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))));
      },
    });
    expect(seen.size).toBe(4);
  });

  it('keeps the gap angle bounded rather than growing without limit', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, NORMAL.holeDelaySeconds + 600);
    expect(Math.abs(world.arena.gap!.centerAngle)).toBeLessThanOrEqual(Math.PI * 2);
  });

  it('leaves the arena at full size during normal play', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 20);
    expect(world.arena.radius).toBe(SIM.arenaRadius);
  });

  it('shrinks the arena under sudden death', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 2, { suddenDeath: true });
    expect(world.arena.radius).toBeLessThan(SIM.arenaRadius);
    expect(world.arena.radius).toBeCloseTo(SIM.arenaRadius - SIM.suddenDeathShrinkRate * 2, 0);
  });

  it('never shrinks past the floor', () => {
    const mode = new NormalMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 120, { suddenDeath: true });
    expect(world.arena.radius).toBe(SIM.minArenaRadius);
  });
});
