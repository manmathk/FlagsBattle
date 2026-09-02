import { Arena } from '../core/Arena';
import { createBody, type Body } from '../core/Body';
import { Rng } from '../core/Rng';
import { fromAngle, vec, type Vec2 } from '../core/Vec2';
import { World } from '../core/World';
import { bodyRadiusFor, CONTACT, ORBIT, SIM } from '../config';
import type { GameMode, ModeContext } from '../modes/GameMode';
import { spawnPositions } from './spawn';

export type RoundStatus = 'running' | 'resolved';

export interface RoundOptions {
  mode: GameMode;
  /** One entry per flag entering the arena. */
  flagCodes: readonly string[];
  seed: number;
  /** Optional arena radius override, primarily useful for deterministic tests. */
  arenaRadius?: number;
}

export class Round {
  readonly world: World;
  readonly mode: GameMode;

  elapsed = 0;
  status: RoundStatus = 'running';
  winner: Body | null = null;
  suddenDeath = false;

  private readonly rng: Rng;

  constructor(options: RoundOptions) {
    this.mode = options.mode;
    this.rng = new Rng(options.seed);

    const count = options.flagCodes.length;
    if (count < 2) throw new Error('Round: need at least two flags');

    const arenaRadius = options.arenaRadius ?? SIM.arenaRadius;
    const bodyRadius = bodyRadiusFor(count, arenaRadius);
    const positions = spawnPositions(count, arenaRadius, bodyRadius, this.rng);
    const bodies = positions.map((pos, i) =>
      createBody(
        i,
        options.flagCodes[i]!,
        pos,
        this.tangentialVelocity(pos),
        this.rng.range(0, Math.PI * 2),
      ),
    );

    this.world = new World({
      bodies,
      arena: new Arena(vec(0, 0), arenaRadius, null),
      bodyRadius,
      restitution: this.mode.restitution,
      maxSpeed: SIM.maxSpeed,
      friction: CONTACT.friction,
      angularRetain: CONTACT.angularRetain,
      maxAngularVel: CONTACT.maxAngularVel,
    });

    this.mode.onRoundStart(this.context());
  }

  step(dt: number): void {
    if (this.status === 'resolved') return;
    this.elapsed += dt;

    if (!this.suddenDeath && this.elapsed >= SIM.roundCapSeconds) {
      this.suddenDeath = true;
      this.mode.onSuddenDeath(this.context());
    }

    this.mode.onStep(this.context(), dt);
    this.world.step(dt, (body) => this.mode.gravity(body, this.elapsed, this.world.arena));
    if (this.world.aliveCount <= 1) this.resolve();
  }

  private tangentialVelocity(pos: Vec2): Vec2 {
    const speed = this.rng.range(SIM.spawnSpeed.min, SIM.spawnSpeed.max);
    const dist = Math.hypot(pos.x, pos.y);
    if (dist === 0) return fromAngle(this.rng.range(0, Math.PI * 2), speed);
    const outX = pos.x / dist;
    const outY = pos.y / dist;
    return vec(-outY * speed * ORBIT.direction, outX * speed * ORBIT.direction);
  }

  private context(): ModeContext {
    return { world: this.world, rng: this.rng, t: this.elapsed, suddenDeath: this.suddenDeath };
  }

  private resolve(): void {
    this.status = 'resolved';
    const survivors = this.world.aliveBodies();
    this.winner = survivors[0] ?? this.lastEliminated();
  }

  private lastEliminated(): Body | null {
    let best: Body | null = null;
    for (const body of this.world.bodies) {
      if (body.eliminatedAtStep < 0) continue;
      if (
        best === null ||
        body.eliminatedAtStep > best.eliminatedAtStep ||
        (body.eliminatedAtStep === best.eliminatedAtStep && body.id < best.id)
      ) best = body;
    }
    return best;
  }
}
