import type { Vec2 } from './Vec2';

/** A gap in the arena ring, as an arc centred on `centerAngle`. */
export interface GapSpec {
  centerAngle: number;
  /** Total angular width in radians; the arc spans +/- width/2 around the centre. */
  width: number;
}

export interface WallContact {
  /** Unit vector pointing from the contact back toward the arena centre. */
  normal: Vec2;
  /** How far the body has pushed past the wall, in pixels. */
  depth: number;
  /** True when the contact lies inside the gap arc, so the body escapes instead of bouncing. */
  throughGap: boolean;
}

/** Signed angular difference in [-pi, pi]. */
const angleDelta = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** How many body radii past the wall a falling body travels before it counts as eliminated. */
const KILL_RADIUS_MARGIN = 3;

/**
 * The circular arena. Mutable: modes rewrite `center`, `radius` and `gap` every
 * step to drive rotation, shrinking and drift.
 */
export class Arena {
  constructor(
    public center: Vec2,
    public radius: number,
    public gap: GapSpec | null,
  ) {}

  isAngleInGap(angle: number): boolean {
    if (this.gap === null) return false;
    return Math.abs(angleDelta(angle, this.gap.centerAngle)) <= this.gap.width / 2;
  }

  /**
   * Wall contact for a body of `bodyRadius` at `pos`, or null if it is still clear.
   * The effective wall sits at `radius - bodyRadius` so bodies rest tangent to the ring.
   */
  wallContact(pos: Vec2, bodyRadius: number): WallContact | null {
    const dx = pos.x - this.center.x;
    const dy = pos.y - this.center.y;
    const dist = Math.hypot(dx, dy);
    const wall = this.radius - bodyRadius;
    if (dist <= wall) return null;

    // At dist 0 there is no meaningful direction; nudge to a fixed axis.
    const inv = dist === 0 ? 0 : 1 / dist;
    return {
      normal: dist === 0 ? { x: -1, y: 0 } : { x: -dx * inv, y: -dy * inv },
      depth: dist - wall,
      throughGap: this.isAngleInGap(Math.atan2(dy, dx)),
    };
  }

  /** True once a falling body is far enough outside the ring to be eliminated. */
  isBeyondKillRadius(pos: Vec2, bodyRadius: number): boolean {
    const dx = pos.x - this.center.x;
    const dy = pos.y - this.center.y;
    const kill = this.radius + KILL_RADIUS_MARGIN * bodyRadius;
    return dx * dx + dy * dy > kill * kill;
  }
}
