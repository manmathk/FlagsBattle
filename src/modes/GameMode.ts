import type { Arena } from '../core/Arena';
import type { Body } from '../core/Body';
import type { Rng } from '../core/Rng';
import type { Vec2 } from '../core/Vec2';
import type { World } from '../core/World';

export type ModeId = 'normal' | 'lightning' | 'chaos';

export interface ModeContext {
  world: World;
  rng: Rng;
  /** Seconds since round start. */
  t: number;
  /** True once the round cap has been passed. */
  suddenDeath: boolean;
}

/**
 * A mode is data plus hooks over the shared World. Modes never own physics, and
 * never import Pixi or touch the DOM — they emit events as plain data and let the
 * renderer decide what to draw.
 */
export interface GameMode {
  readonly id: ModeId;
  readonly usesSeries: boolean;
  /** Wall/body bounciness for this mode. */
  readonly restitution: number;

  /**
   * Acceleration on `body` this step. The arena is passed rather than cached by
   * the mode: Chaos moves its centre every step, and a stale centre would aim the
   * orbital field at the wrong place.
   */
  gravity(body: Body, t: number, arena: Arena): Vec2;

  onRoundStart(ctx: ModeContext): void;

  /** Advance mode logic and reshape the arena. Called before the physics step. */
  onStep(ctx: ModeContext, dt: number): void;

  /**
   * One-shot notification that the round cap has been reached. Every mode must
   * respond with something that provably thins the field: shrinking the arena is
   * useless in a mode with no gap.
   */
  onSuddenDeath(ctx: ModeContext): void;
}
