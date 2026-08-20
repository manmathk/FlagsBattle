import type { Arena } from '../core/Arena';
import type { Body } from '../core/Body';
import { orbitalForce } from '../core/forces';
import { vec, type Vec2 } from '../core/Vec2';
import type { ChaosEventKind } from '../core/World';
import { ORBIT, SIM } from '../config';
import type { GameMode, ModeContext } from './GameMode';

export const CHAOS = {
  gapWidth: Math.PI / 18,
  gapRotation: 0.45,
  /** Grace period before the arena starts closing in. */
  shrinkDelay: 8,
  shrinkRate: 3,
  minRadius: 140,
  /** Peak offset of the arena centre from the stage centre, per axis. */
  driftAmplitude: 60,
  driftFreqX: 0.13,
  driftFreqY: 0.19,
  eventInterval: 6,
  eventJitter: 2,
  eventDuration: 2.5,
  vortexAccel: 700,
  windAccel: 600,
  spinAccel: 650,
  speedBurstScale: 1.6,
} as const;

const TWO_PI = Math.PI * 2;

const EVENT_KINDS: readonly ChaosEventKind[] = ['vortex', 'wind', 'speedBurst', 'chaosSpin'];

interface ActiveEvent {
  kind: ChaosEventKind;
  until: number;
  /** Unit direction, for wind. */
  dir: Vec2;
  /** Sign of rotation, for spin. */
  spin: number;
}

/**
 * Turbulent mode: the arena closes in and wanders while random forces shove the
 * field around. The shrink supplies the elimination pressure; the events just
 * steer flags toward the gap.
 */
export class ChaosMode implements GameMode {
  readonly id = 'chaos' as const;
  readonly usesSeries = false;
  readonly restitution = 0.9;

  private gapAngle = -Math.PI / 2;
  private radius: number = SIM.arenaRadius;
  private event: ActiveEvent | null = null;
  private nextEventAt = 0;
  /** Where the drifting centre currently is; also written to the arena each step. */
  private center: Vec2 = vec(0, 0);

  /** Currently active event, for observation. */
  get activeEvent(): { kind: ChaosEventKind } | null {
    return this.event === null ? null : { kind: this.event.kind };
  }

  gravity(body: Body, _t: number, arena: Arena): Vec2 {
    // Events stack on top of the shared orbital field, so Chaos is the base
    // centrifuge plus turbulence rather than a separate force model.
    const force = orbitalForce(body.pos, arena.center, ORBIT);
    if (this.event === null) return force;

    switch (this.event.kind) {
      case 'vortex': {
        const dx = arena.center.x - body.pos.x;
        const dy = arena.center.y - body.pos.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          force.x += (dx / len) * CHAOS.vortexAccel;
          force.y += (dy / len) * CHAOS.vortexAccel;
        }
        break;
      }
      case 'wind': {
        force.x += this.event.dir.x * CHAOS.windAccel;
        force.y += this.event.dir.y * CHAOS.windAccel;
        break;
      }
      case 'chaosSpin': {
        const dx = body.pos.x - arena.center.x;
        const dy = body.pos.y - arena.center.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          // Perpendicular to the radius, so the field swirls rather than being
          // pushed in or out.
          force.x += (-dy / len) * CHAOS.spinAccel * this.event.spin;
          force.y += (dx / len) * CHAOS.spinAccel * this.event.spin;
        }
        break;
      }
      case 'speedBurst':
        // One-shot velocity scaling, applied in onStep rather than as a force.
        break;
    }
    return force;
  }

  onRoundStart(ctx: ModeContext): void {
    this.gapAngle = -Math.PI / 2;
    this.radius = SIM.arenaRadius;
    this.event = null;
    this.nextEventAt = CHAOS.eventInterval;
    this.center = vec(0, 0);
    ctx.world.arena.center = vec(0, 0);
    ctx.world.arena.radius = this.radius;
    ctx.world.arena.gap = { centerAngle: this.gapAngle, width: CHAOS.gapWidth };
  }

  onStep(ctx: ModeContext, dt: number): void {
    const arena = ctx.world.arena;

    this.gapAngle = (this.gapAngle + CHAOS.gapRotation * dt) % TWO_PI;
    arena.gap = { centerAngle: this.gapAngle, width: CHAOS.gapWidth };

    if (ctx.t > CHAOS.shrinkDelay) {
      const rate = CHAOS.shrinkRate + (ctx.suddenDeath ? SIM.suddenDeathShrinkRate : 0);
      this.radius = Math.max(CHAOS.minRadius, this.radius - rate * dt);
    }
    arena.radius = this.radius;

    // Lissajous drift: two incommensurate frequencies, so the centre never
    // settles into a repeating short loop.
    this.center = vec(
      Math.sin(ctx.t * TWO_PI * CHAOS.driftFreqX) * CHAOS.driftAmplitude,
      Math.sin(ctx.t * TWO_PI * CHAOS.driftFreqY) * CHAOS.driftAmplitude,
    );
    arena.center = { ...this.center };

    if (this.event !== null && ctx.t >= this.event.until) this.event = null;

    if (ctx.t >= this.nextEventAt) {
      this.startEvent(ctx);
      this.nextEventAt =
        ctx.t + CHAOS.eventInterval + ctx.rng.range(-CHAOS.eventJitter, CHAOS.eventJitter);
    }
  }

  onSuddenDeath(_ctx: ModeContext): void {
    // Shrinking accelerates continuously in onStep; nothing to kick off here.
  }

  private startEvent(ctx: ModeContext): void {
    const kind = ctx.rng.pick(EVENT_KINDS);
    const angle = ctx.rng.range(0, TWO_PI);
    this.event = {
      kind,
      until: ctx.t + CHAOS.eventDuration,
      dir: vec(Math.cos(angle), Math.sin(angle)),
      spin: ctx.rng.next() < 0.5 ? -1 : 1,
    };

    if (kind === 'speedBurst') {
      for (const body of ctx.world.bodies) {
        if (body.state !== 'alive') continue;
        body.vel.x *= CHAOS.speedBurstScale;
        body.vel.y *= CHAOS.speedBurstScale;
      }
    }

    ctx.world.emit({ type: 'chaosEvent', kind });
  }
}
