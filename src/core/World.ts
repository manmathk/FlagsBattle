import { Arena } from './Arena';
import type { Body } from './Body';
import { SpatialGrid } from './SpatialGrid';
import type { Vec2 } from './Vec2';

/** A fixed circular obstacle inside the arena. Coordinates are relative to arena center. */
export interface Obstacle {
  readonly id: number;
  readonly offset: Vec2;
  readonly radius: number;
}

/** Acceleration applied to a body this step, in px/s^2. */
export type ForceField = (body: Body) => Vec2;

export type ChaosEventKind = 'vortex' | 'wind' | 'speedBurst' | 'chaosSpin';

export type WorldEvent =
  | { type: 'collision'; a: number; b: number; at: Vec2; impact: number }
  | { type: 'wallBounce'; bodyId: number; at: Vec2; impact: number }
  | { type: 'obstacleBounce'; bodyId: number; obstacleId: number; at: Vec2; impact: number }
  | { type: 'eliminated'; bodyId: number; at: Vec2 }
  | { type: 'lightning'; bodyId: number; at: Vec2 }
  | { type: 'chaosEvent'; kind: ChaosEventKind };

export interface WorldOptions {
  bodies: Body[];
  arena: Arena;
  bodyRadius: number;
  restitution: number;
  maxSpeed: number;
  /** Coulomb friction coefficient at contacts. */
  friction: number;
  /** Fraction of spin retained per second. */
  angularRetain: number;
  /** rad/s cap, so a fast spin cannot strobe the sprite. */
  maxAngularVel: number;
  obstacles?: readonly Obstacle[];
}

/** Fraction of overlap corrected per step. */
const POSITION_CORRECTION = 0.8;
/** Collisions below this closing speed do not emit an event, to keep VFX sane. */
const COLLISION_EVENT_THRESHOLD = 40;

export class World {
  readonly bodies: Body[];
  readonly arena: Arena;
  readonly bodyRadius: number;
  readonly restitution: number;
  readonly maxSpeed: number;
  readonly friction: number;
  readonly angularRetain: number;
  readonly maxAngularVel: number;
  readonly obstacles: readonly Obstacle[];

  stepIndex = 0;

  private readonly grid: SpatialGrid;
  private events: WorldEvent[] = [];
  private alive: number;

  constructor(options: WorldOptions) {
    this.bodies = options.bodies;
    this.arena = options.arena;
    this.bodyRadius = options.bodyRadius;
    this.restitution = options.restitution;
    this.maxSpeed = options.maxSpeed;
    this.friction = options.friction;
    this.angularRetain = options.angularRetain;
    this.maxAngularVel = options.maxAngularVel;
    this.obstacles = options.obstacles ?? [];
    this.grid = new SpatialGrid(this.bodyRadius * 2);
    this.alive = this.bodies.filter((b) => b.state === 'alive').length;
  }

  get aliveCount(): number { return this.alive; }
  aliveBodies(): Body[] { return this.bodies.filter((b) => b.state === 'alive'); }

  emit(event: WorldEvent): void { this.events.push(event); }
  drainEvents(): WorldEvent[] { const drained = this.events; this.events = []; return drained; }

  /** Eliminate a body outright — used by Lightning strikes and sudden death. */
  eliminate(body: Body): void {
    if (body.state === 'eliminated') return;
    if (body.state === 'alive') this.alive--;
    body.state = 'eliminated';
    body.targeted = false;
    body.eliminatedAtStep = this.stepIndex;
    this.emit({ type: 'eliminated', bodyId: body.id, at: { ...body.pos } });
  }

  step(dt: number, force: ForceField): void {
    this.stepIndex++;
    this.integrate(dt, force);
    this.resolveCollisions();
    this.resolveObstacleCollisions();
    this.applyArenaConstraint();
    this.reapFallen();
  }

  private integrate(dt: number, force: ForceField): void {
    const maxSpeedSq = this.maxSpeed * this.maxSpeed;
    for (const body of this.bodies) {
      if (body.state === 'eliminated') continue;
      const acc = force(body);
      body.vel.x += acc.x * dt;
      body.vel.y += acc.y * dt;

      const speedSq = body.vel.x * body.vel.x + body.vel.y * body.vel.y;
      if (speedSq > maxSpeedSq) {
        const k = this.maxSpeed / Math.sqrt(speedSq);
        body.vel.x *= k;
        body.vel.y *= k;
      }

      body.prevPos.x = body.pos.x;
      body.prevPos.y = body.pos.y;
      body.pos.x += body.vel.x * dt;
      body.pos.y += body.vel.y * dt;

      body.angle += body.angularVel * dt;
      body.angularVel *= Math.pow(this.angularRetain, dt);
      if (body.angularVel > this.maxAngularVel) body.angularVel = this.maxAngularVel;
      else if (body.angularVel < -this.maxAngularVel) body.angularVel = -this.maxAngularVel;
    }
  }

  private resolveCollisions(): void {
    const bodies = this.bodies;
    this.grid.clear();
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i]!.state !== 'alive') continue;
      this.grid.insert(i, bodies[i]!.pos.x, bodies[i]!.pos.y);
    }

    const diameter = this.bodyRadius * 2;
    const diameterSq = diameter * diameter;

    this.grid.forEachCandidatePair((ia, ib) => {
      const a = bodies[ia]!;
      const b = bodies[ib]!;
      let nx = b.pos.x - a.pos.x;
      let ny = b.pos.y - a.pos.y;
      const distSq = nx * nx + ny * ny;
      if (distSq >= diameterSq) return;

      let dist = Math.sqrt(distSq);
      if (dist === 0) { nx = 1; ny = 0; dist = 1e-6; }
      else { nx /= dist; ny /= dist; }

      const overlap = diameter - dist;
      const shift = (overlap * POSITION_CORRECTION) / 2;
      a.pos.x -= nx * shift; a.pos.y -= ny * shift;
      b.pos.x += nx * shift; b.pos.y += ny * shift;

      const relN = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
      if (relN > 0) return;
      const j = (-(1 + this.restitution) * relN) / 2;
      a.vel.x -= j * nx; a.vel.y -= j * ny;
      b.vel.x += j * nx; b.vel.y += j * ny;
      this.applyPairFriction(a, b, nx, ny, j);

      const impact = Math.abs(relN);
      if (impact > COLLISION_EVENT_THRESHOLD) {
        this.emit({ type: 'collision', a: a.id, b: b.id, at: { x: a.pos.x + nx * this.bodyRadius, y: a.pos.y + ny * this.bodyRadius }, impact });
      }
    });
  }

  private resolveObstacleCollisions(): void {
    if (this.obstacles.length === 0) return;
    for (const body of this.bodies) {
      if (body.state !== 'alive') continue;
      for (const obstacle of this.obstacles) {
        const centerX = this.arena.center.x + obstacle.offset.x;
        const centerY = this.arena.center.y + obstacle.offset.y;
        const safeRadius = obstacle.radius + this.bodyRadius;
        // Obstacles stop participating once the shrinking arena reaches them.
        if (Math.hypot(centerX - this.arena.center.x, centerY - this.arena.center.y) + safeRadius > this.arena.radius - this.bodyRadius) continue;

        let nx = body.pos.x - centerX;
        let ny = body.pos.y - centerY;
        const distSq = nx * nx + ny * ny;
        if (distSq >= safeRadius * safeRadius) continue;

        let dist = Math.sqrt(distSq);
        if (dist === 0) { nx = 1; ny = 0; dist = 1e-6; }
        else { nx /= dist; ny /= dist; }

        const overlap = safeRadius - dist;
        body.pos.x += nx * overlap * POSITION_CORRECTION;
        body.pos.y += ny * overlap * POSITION_CORRECTION;

        const outwardVelocity = body.vel.x * nx + body.vel.y * ny;
        if (outwardVelocity >= 0) continue;

        const factor = 1 + this.restitution;
        body.vel.x -= factor * outwardVelocity * nx;
        body.vel.y -= factor * outwardVelocity * ny;
        this.applyWallFriction(body, { x: -nx, y: -ny }, Math.abs(factor * outwardVelocity));

        const impact = Math.abs(outwardVelocity);
        if (impact > COLLISION_EVENT_THRESHOLD) {
          this.emit({
            type: 'obstacleBounce',
            bodyId: body.id,
            obstacleId: obstacle.id,
            at: { x: centerX + nx * obstacle.radius, y: centerY + ny * obstacle.radius },
            impact,
          });
        }
      }
    }
  }

  private applyArenaConstraint(): void {
    for (const body of this.bodies) {
      if (body.state !== 'alive') continue;
      const contact = this.arena.wallContact(body.pos, this.bodyRadius);
      if (contact === null) continue;
      if (contact.throughGap) {
        body.state = 'falling';
        this.alive--;
        continue;
      }
      const { normal, depth } = contact;
      body.pos.x += normal.x * depth;
      body.pos.y += normal.y * depth;
      const vn = body.vel.x * normal.x + body.vel.y * normal.y;
      if (vn < 0) {
        const factor = (1 + this.restitution) * vn;
        body.vel.x -= factor * normal.x;
        body.vel.y -= factor * normal.y;
        this.applyWallFriction(body, normal, Math.abs(factor));
        const impact = Math.abs(vn);
        if (impact > COLLISION_EVENT_THRESHOLD) this.emit({ type: 'wallBounce', bodyId: body.id, at: { ...body.pos }, impact });
      }
    }
  }

  private applyPairFriction(a: Body, b: Body, nx: number, ny: number, normalImpulse: number): void {
    if (this.friction <= 0) return;
    const tx = -ny; const ty = nx; const r = this.bodyRadius;
    const slide = (b.vel.x - a.vel.x) * tx + (b.vel.y - a.vel.y) * ty - r * (a.angularVel + b.angularVel);
    if (slide === 0) return;
    const limit = this.friction * Math.abs(normalImpulse);
    let jt = -slide / 6;
    if (jt > limit) jt = limit; else if (jt < -limit) jt = -limit;
    a.vel.x -= jt * tx; a.vel.y -= jt * ty;
    b.vel.x += jt * tx; b.vel.y += jt * ty;
    const spin = (2 * jt) / r;
    a.angularVel -= spin; b.angularVel -= spin;
  }

  private applyWallFriction(body: Body, normal: Vec2, normalImpulse: number): void {
    if (this.friction <= 0) return;
    const outX = -normal.x; const outY = -normal.y;
    const tx = -outY; const ty = outX; const r = this.bodyRadius;
    const slide = body.vel.x * tx + body.vel.y * ty + r * body.angularVel;
    if (slide === 0) return;
    const limit = this.friction * normalImpulse;
    let jt = -slide / 3;
    if (jt > limit) jt = limit; else if (jt < -limit) jt = -limit;
    body.vel.x += jt * tx; body.vel.y += jt * ty;
    body.angularVel += (2 * jt) / r;
  }

  private reapFallen(): void {
    for (const body of this.bodies) {
      if (body.state !== 'falling') continue;
      if (this.arena.isBeyondKillRadius(body.pos, this.bodyRadius)) {
        body.state = 'eliminated';
        body.eliminatedAtStep = this.stepIndex;
        this.emit({ type: 'eliminated', bodyId: body.id, at: { ...body.pos } });
      }
    }
  }
}
