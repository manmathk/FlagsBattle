import { FLAGS } from './data/flags';

/**
 * Simulation tuning. These are the values the design spec calls out as initial
 * rather than settled: the headless round tests in src/game report measured round
 * duration, and the mode constants are tuned against a 45-90s target.
 */

/** Logical stage the simulation runs in; the renderer scales this to the canvas. */
export const STAGE = { width: 1920, height: 1080 } as const;

export const SIM = {
  /** Fixed physics step. Decoupled from the render frame. */
  fixedStep: 1 / 120,
  /** Ceiling on catch-up steps per frame, so a stalled tab cannot death-spiral. */
  maxStepsPerFrame: 5,
  /** Far below one body diameter per step, which is what prevents tunnelling. */
  maxSpeed: 2000,
  arenaRadius: 460,
  /** Target fraction of arena area covered by flags; drives body radius. */
  packingDensity: 0.68,
  /** Hard cap before sudden death begins. A safety net, not the expected length. */
  roundCapSeconds: 150,
  /** Arena contraction during sudden death, px/s (Normal and Chaos). */
  suddenDeathShrinkRate: 40,
  /** Floor for any arena contraction. */
  minArenaRadius: 70,
  /** Initial speed range given to flags at spawn. */
  spawnSpeed: { min: 40, max: 160 },
} as const;

/**
 * The orbital field every mode runs on.
 *
 * Gravity points at the arena centre rather than downward, so flags circulate
 * instead of settling into a dead pile at the bottom. `centripetal` alone would
 * collapse them into the middle where the gap cannot reach it; `tangential` is
 * what makes it an orbit, and the balance is tuned so the steady-state radius
 * sits at the wall — a centrifuge, with flags riding the ring where the gap can
 * take them.
 */
export const ORBIT = {
  centripetal: 900,
  tangential: 620,
  direction: 1,
} as const;

/** Contact response shared by every mode. */
export const CONTACT = {
  /** Coulomb friction coefficient. This is what makes flags visibly roll. */
  friction: 0.35,
  /** Fraction of spin retained per second. */
  angularRetain: 0.55,
  /** rad/s cap, so a fast spin does not strobe the sprite. */
  maxAngularVel: 13,
} as const;

/**
 * Flags per round. Every country in the dataset enters every round, so this is
 * the dataset size rather than a tunable: body radius, grid cell size and spawn
 * capacity all derive from it.
 */
export const FLAG_COUNT = FLAGS.length;

/**
 * Body radius derived from the flag count, so the arena stays sane if the count
 * ever changes rather than the radius being a magic number tied to N=200.
 *
 * Clamped, because the density formula grows the radius as the count *falls*: a
 * 20-flag round would otherwise ask for 76px bodies, which the spawn lattice
 * cannot lay out inside the arena. The clamp only ever binds below ~40 flags, so
 * it never affects the shipped 200-flag round (~27px).
 */
export const bodyRadiusFor = (
  count: number,
  arenaRadius = SIM.arenaRadius,
  density: number = SIM.packingDensity,
): number => {
  if (count <= 0) throw new Error('bodyRadiusFor: count must be positive');
  const derived = arenaRadius * Math.sqrt(density / count);
  return Math.min(derived, arenaRadius / 8);
};
