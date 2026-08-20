import { describe, expect, it } from 'vitest';
import { LightningMode, LIGHTNING } from './LightningMode';
import { makeWorld, runMode } from '../test/fixture';
import { vec } from '../core/Vec2';
import { FLAG_COUNT, ORBIT, SIM } from '../config';

describe('LightningMode', () => {
  it('does not run a series', () => {
    expect(new LightningMode().usesSeries).toBe(false);
  });

  it('closes the ring completely', () => {
    const mode = new LightningMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 1);
    expect(world.arena.gap).toBeNull();
  });

  it('runs on the same orbital field as the other modes', () => {
    const mode = new LightningMode();
    const world = makeWorld(20, mode);
    const body = world.bodies[0]!;
    body.pos = vec(0, 200);

    const g = mode.gravity(body, 0, world.arena);
    // Directly below the centre, so the pull is straight up.
    expect(g.y).toBeCloseTo(-ORBIT.centripetal, 6);
    expect(Math.abs(g.x)).toBeCloseTo(ORBIT.tangential, 6);
  });

  it('telegraphs a strike before it lands', () => {
    const mode = new LightningMode();
    const world = makeWorld(FLAG_COUNT, mode);
    let sawTargetedAlive = false;
    // Past the first batch being scheduled, but partway through its telegraph.
    runMode(mode, world, LIGHTNING.strikeInterval + LIGHTNING.telegraph / 2, {
      onStep: ({ world: w }) => {
        if (w.bodies.some((b) => b.targeted && b.state === 'alive')) sawTargetedAlive = true;
      },
    });
    expect(sawTargetedAlive).toBe(true);
    // Telegraphed, not yet struck.
    expect(world.aliveCount).toBe(FLAG_COUNT);
  });

  it('lands the strike after the telegraph', () => {
    const mode = new LightningMode();
    const world = makeWorld(FLAG_COUNT, mode);
    runMode(mode, world, LIGHTNING.strikeInterval + LIGHTNING.telegraph + 0.1);
    expect(world.aliveCount).toBeLessThan(FLAG_COUNT);
  });

  it('emits a lightning event for each strike', () => {
    const mode = new LightningMode();
    const world = makeWorld(FLAG_COUNT, mode);
    runMode(mode, world, LIGHTNING.strikeInterval + LIGHTNING.telegraph + 0.1);
    const bolts = world.drainEvents().filter((e) => e.type === 'lightning');
    expect(bolts.length).toBeGreaterThan(0);
  });

  it('scales the strike batch to the size of the surviving field', () => {
    // Just past the first batch being scheduled, before any bolt has landed.
    const justAfterFirstBatch = LIGHTNING.strikeInterval + 0.01;

    const crowded = new LightningMode();
    const crowdedWorld = makeWorld(FLAG_COUNT, crowded);
    runMode(crowded, crowdedWorld, justAfterFirstBatch);
    const crowdedBatch = crowdedWorld.bodies.filter((b) => b.targeted).length;

    const sparse = new LightningMode();
    const sparseWorld = makeWorld(10, sparse);
    runMode(sparse, sparseWorld, justAfterFirstBatch);
    const sparseBatch = sparseWorld.bodies.filter((b) => b.targeted).length;

    expect(crowdedBatch).toBe(Math.round(FLAG_COUNT * LIGHTNING.killFraction));
    expect(sparseBatch).toBe(1); // floors at one so the round always progresses
    expect(crowdedBatch).toBeGreaterThan(sparseBatch);
  });

  it('thins a full field to a single survivor inside the round cap', () => {
    const mode = new LightningMode();
    const world = makeWorld(FLAG_COUNT, mode);
    let secondsToFinish = Infinity;
    runMode(mode, world, 120, {
      onStep: (ctx) => {
        if (ctx.world.aliveCount <= 1 && secondsToFinish === Infinity) secondsToFinish = ctx.t;
      },
    });

    expect(world.aliveCount).toBe(1);
    // The design target is a 45-90s round; the cap is 150s.
    expect(secondsToFinish).toBeGreaterThan(30);
    expect(secondsToFinish).toBeLessThan(SIM.roundCapSeconds);
  });

  it('stops striking once a single flag remains, so a winner survives', () => {
    const mode = new LightningMode();
    const world = makeWorld(FLAG_COUNT, mode);
    runMode(mode, world, 200);
    expect(world.aliveCount).toBe(1);
  });

  it('kills faster under sudden death', () => {
    const normal = new LightningMode();
    const normalWorld = makeWorld(FLAG_COUNT, normal);
    runMode(normal, normalWorld, 5);

    const rushed = new LightningMode();
    const rushedWorld = makeWorld(FLAG_COUNT, rushed);
    runMode(rushed, rushedWorld, 5, { suddenDeath: true });

    expect(rushedWorld.aliveCount).toBeLessThan(normalWorld.aliveCount);
  });

  it('does not shrink the arena, which would eliminate nobody without a gap', () => {
    const mode = new LightningMode();
    const world = makeWorld(20, mode);
    runMode(mode, world, 10, { suddenDeath: true });
    expect(world.arena.radius).toBe(SIM.arenaRadius);
  });
});
