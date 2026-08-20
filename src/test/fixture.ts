import { Arena } from '../core/Arena';
import { createBody, type Body } from '../core/Body';
import { Rng } from '../core/Rng';
import { vec } from '../core/Vec2';
import { World } from '../core/World';
import { bodyRadiusFor, CONTACT, FLAG_COUNT, SIM } from '../config';
import type { GameMode, ModeContext } from '../modes/GameMode';
import { spawnPositions } from '../game/spawn';

/**
 * A world of `count` flags laid out exactly as a real round would lay them out.
 *
 * Body radius is always the shipped 200-flag radius, not `bodyRadiusFor(count)`:
 * the density formula scales radius *up* as the count falls, so a 20-flag test
 * world would otherwise get 76px bodies that cannot be laid out on the lattice.
 */
export const makeWorld = (count: number, mode: GameMode, seed = 1): World => {
  const rng = new Rng(seed);
  const bodyRadius = bodyRadiusFor(FLAG_COUNT);
  const positions = spawnPositions(count, SIM.arenaRadius, bodyRadius, rng);
  const bodies: Body[] = positions.map((pos, i) => createBody(i, `f${i}`, pos, vec(0, 0)));
  return new World({
    bodies,
    arena: new Arena(vec(0, 0), SIM.arenaRadius, null),
    bodyRadius,
    restitution: mode.restitution,
    maxSpeed: SIM.maxSpeed,
    friction: CONTACT.friction,
    angularRetain: CONTACT.angularRetain,
    maxAngularVel: CONTACT.maxAngularVel,
  });
};

/**
 * Drive a mode forward without the physics step, so mode logic can be observed in
 * isolation from collisions.
 */
export const runMode = (
  mode: GameMode,
  world: World,
  seconds: number,
  opts: { seed?: number; suddenDeath?: boolean; onStep?: (ctx: ModeContext) => void } = {},
): ModeContext => {
  const dt = SIM.fixedStep;
  const ctx: ModeContext = {
    world,
    rng: new Rng(opts.seed ?? 7),
    t: 0,
    suddenDeath: opts.suddenDeath ?? false,
  };
  mode.onRoundStart(ctx);
  if (ctx.suddenDeath) mode.onSuddenDeath(ctx);

  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    ctx.t += dt;
    world.stepIndex++;
    mode.onStep(ctx, dt);
    opts.onStep?.(ctx);
  }
  return ctx;
};
