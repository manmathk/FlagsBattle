import type { Arena } from '../core/Arena';
import type { Body } from '../core/Body';
import { orbitalForce } from '../core/forces';
import type { Vec2 } from '../core/Vec2';
import { ORBIT, SIM } from '../config';
import type { GameMode, ModeContext } from './GameMode';

/**
 * Tuning knobs, exported so tests can be written against them rather than
 * duplicating their values — otherwise every retune breaks the test suite.
 *
 * Both were tuned against measured round length, not derived: at a 45-degree gap
 * 200 flags drained in 15s and at 20 degrees in 45s, against a 45-90s target.
 */
export const NORMAL = {
  /** ~16 degrees. */
  gapWidth: Math.PI / 14,
  /** rad/s — a full revolution every ~12.6s. */
  gapRotation: 0.5,
} as const;

const GAP_WIDTH = NORMAL.gapWidth;
const GAP_ROTATION = NORMAL.gapRotation;

const TWO_PI = Math.PI * 2;

/**
 * Classic mode: flags orbit the arena on the shared centrifugal field while a gap
 * sweeps around the ring, flinging out whatever is riding the wall as it passes.
 * The only mode that runs a series.
 */
export class NormalMode implements GameMode {
  readonly id = 'normal' as const;
  readonly usesSeries = true;
  readonly restitution = 0.9;

  private gapAngle = -Math.PI / 2;

  gravity(body: Body, _t: number, arena: Arena): Vec2 {
    return orbitalForce(body.pos, arena.center, ORBIT);
  }

  onRoundStart(ctx: ModeContext): void {
    // Start the gap at the top so nothing drains before the pack has settled.
    this.gapAngle = -Math.PI / 2;
    ctx.world.arena.radius = SIM.arenaRadius;
    ctx.world.arena.gap = { centerAngle: this.gapAngle, width: GAP_WIDTH };
  }

  onStep(ctx: ModeContext, dt: number): void {
    // Wrapped, not accumulated: an ever-growing angle loses float precision over
    // a long unattended session.
    this.gapAngle = (this.gapAngle + GAP_ROTATION * dt) % TWO_PI;
    ctx.world.arena.gap = { centerAngle: this.gapAngle, width: GAP_WIDTH };

    if (ctx.suddenDeath) {
      ctx.world.arena.radius = Math.max(
        SIM.minArenaRadius,
        ctx.world.arena.radius - SIM.suddenDeathShrinkRate * dt,
      );
    }
  }

  onSuddenDeath(_ctx: ModeContext): void {
    // Shrinking is continuous and handled in onStep; nothing to kick off here.
  }
}
