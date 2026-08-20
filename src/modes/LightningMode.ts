import type { Arena } from '../core/Arena';
import type { Body } from '../core/Body';
import { orbitalForce } from '../core/forces';
import type { Vec2 } from '../core/Vec2';
import { ORBIT, SIM } from '../config';
import type { GameMode, ModeContext } from './GameMode';

/**
 * Tuning knobs, exported so tests reference them instead of duplicating their
 * values. The interval is the useful lever on round length (see killFraction).
 */
export const LIGHTNING = {
  /** Seconds between strike batches during normal play. */
  strikeInterval: 0.8,
  /** Seconds between batches once the round cap is passed. */
  suddenDeathInterval: 0.15,
  /** Fraction of the living field removed per batch. */
  killFraction: 0.04,
  /** Warning time between a flag lighting up and the bolt landing. */
  telegraph: 0.6,
} as const;

const STRIKE_INTERVAL = LIGHTNING.strikeInterval;
const SUDDEN_DEATH_INTERVAL = LIGHTNING.suddenDeathInterval;

/**
 * Scaling kills to the *living* field rather than the dead is what bounds the
 * round: the field decays exponentially rather than linearly. It is not purely
 * exponential though — once the field is under ~13 the `max(1, ...)` floor takes
 * over and the tail runs at one kill per interval, which is most of the round's
 * back half and the reason the interval, not the fraction, is the useful lever.
 */
const KILL_FRACTION = LIGHTNING.killFraction;
const TELEGRAPH = LIGHTNING.telegraph;

interface PendingStrike {
  bodyId: number;
  fireAt: number;
}

/**
 * Closed arena, no drain. Lightning picks flags off at random, so survival is
 * luck rather than position.
 */
export class LightningMode implements GameMode {
  readonly id = 'lightning' as const;
  readonly usesSeries = false;
  /** Bouncier than Normal: with no gap to drain into, the ring needs the energy. */
  readonly restitution = 0.98;

  private sinceLastStrike = 0;
  private interval: number = STRIKE_INTERVAL;
  private pending: PendingStrike[] = [];

  gravity(body: Body, _t: number, arena: Arena): Vec2 {
    return orbitalForce(body.pos, arena.center, ORBIT);
  }

  onRoundStart(ctx: ModeContext): void {
    this.sinceLastStrike = 0;
    this.interval = STRIKE_INTERVAL;
    this.pending = [];
    ctx.world.arena.radius = SIM.arenaRadius;
    ctx.world.arena.gap = null;
  }

  onStep(ctx: ModeContext, dt: number): void {
    this.landDueStrikes(ctx);
    this.sinceLastStrike += dt;
    if (this.sinceLastStrike >= this.interval) {
      this.sinceLastStrike = 0;
      this.scheduleBatch(ctx);
    }
  }

  onSuddenDeath(_ctx: ModeContext): void {
    // The arena has no gap, so shrinking it would eliminate nobody. Strike faster
    // instead — that is the only mechanism here that reduces the field.
    this.interval = SUDDEN_DEATH_INTERVAL;
    this.sinceLastStrike = this.interval;
  }

  private scheduleBatch(ctx: ModeContext): void {
    const { world, rng } = ctx;
    // Never strike the last flag standing: the round needs a winner to survive.
    if (world.aliveCount <= 1) return;

    const candidates = world.bodies.filter((b) => b.state === 'alive' && !b.targeted);
    if (candidates.length === 0) return;

    const wanted = Math.max(1, Math.round(world.aliveCount * KILL_FRACTION));
    // Leave at least one flag untargeted so a winner always remains.
    const batch = Math.min(wanted, candidates.length, world.aliveCount - 1);

    const chosen = rng.shuffle([...candidates]).slice(0, batch);
    for (const body of chosen) {
      body.targeted = true;
      this.pending.push({ bodyId: body.id, fireAt: ctx.t + TELEGRAPH });
    }
  }

  private landDueStrikes(ctx: ModeContext): void {
    if (this.pending.length === 0) return;

    const stillPending: PendingStrike[] = [];
    for (const strike of this.pending) {
      if (strike.fireAt > ctx.t) {
        stillPending.push(strike);
        continue;
      }

      const body = ctx.world.bodies[strike.bodyId];
      if (body === undefined || body.state !== 'alive') continue;

      // A flag telegraphed while others were alive can end up the last one
      // standing by the time the bolt lands; spare it.
      if (ctx.world.aliveCount <= 1) {
        body.targeted = false;
        continue;
      }

      ctx.world.emit({ type: 'lightning', bodyId: body.id, at: { ...body.pos } });
      ctx.world.eliminate(body);
    }
    this.pending = stillPending;
  }
}
