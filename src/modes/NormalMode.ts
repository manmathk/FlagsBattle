import type { Arena } from '../core/Arena';
import type { Body } from '../core/Body';
import { orbitalForce } from '../core/forces';
import type { Vec2 } from '../core/Vec2';
import { ORBIT, SIM } from '../config';
import type { GameMode, ModeContext } from './GameMode';

export const NORMAL = {
  /** Holes stay closed while the flags settle into the spinning arena. */
  holeDelaySeconds: 5,
  /** ~16 degrees. */
  gapWidth: Math.PI / 14,
  /** rad/s — a full revolution every ~12.6s. */
  gapRotation: 0.5,
} as const;

const GAP_WIDTH = NORMAL.gapWidth;
const GAP_ROTATION = NORMAL.gapRotation;
const TWO_PI = Math.PI * 2;

/**
 * Classic battle: flags enter a spinning arena. For the first five seconds the
 * ring is closed so the field can settle. Then holes begin opening and a gap
 * sweeps around the ring, eliminating flags that fall through it.
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
    this.gapAngle = -Math.PI / 2;
    ctx.world.arena.radius = SIM.arenaRadius;
    // No hole at the start: flags get five seconds to enter and settle.
    ctx.world.arena.gap = null;
  }

  onStep(ctx: ModeContext, dt: number): void {
    // The first five seconds are a closed-arena countdown. After that, holes
    // begin opening and the gap rotates continuously around the ring.
    if (ctx.t < NORMAL.holeDelaySeconds) {
      ctx.world.arena.gap = null;
    } else {
      this.gapAngle = (this.gapAngle + GAP_ROTATION * dt) % TWO_PI;
      ctx.world.arena.gap = { centerAngle: this.gapAngle, width: GAP_WIDTH };
    }

    if (ctx.suddenDeath) {
      ctx.world.arena.radius = Math.max(
        SIM.minArenaRadius,
        ctx.world.arena.radius - SIM.suddenDeathShrinkRate * dt,
      );
    }
  }

  onSuddenDeath(_ctx: ModeContext): void {
    // Shrinking is continuous and handled in onStep.
  }
}
