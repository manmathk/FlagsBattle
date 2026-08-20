import { vec, type Vec2 } from './Vec2';

export interface OrbitalParams {
  /** Inward acceleration toward the arena centre, px/s². */
  centripetal: number;
  /** Tangential acceleration that sustains circulation, px/s². */
  tangential: number;
  /** +1 or -1: which way the field circulates. */
  direction: 1 | -1;
}

/**
 * Uniform orbital field: a constant inward pull plus a constant tangential drive.
 *
 * The inward pull alone would collapse the whole field into a blob at the centre,
 * where the arena gap can never reach it. The tangential term is what makes it an
 * orbit: at steady state a body circles at radius `v²/centripetal`, so tuning the
 * drive so that radius lands at or past the wall turns the arena into a
 * centrifuge — flags ride the wall, which is exactly where the gap can take them.
 *
 * The magnitude is deliberately distance-independent rather than inverse-square.
 * Orbit radius then depends only on speed, which makes the balance tunable instead
 * of having near-centre bodies whipped around at enormous acceleration.
 */
export const orbitalForce = (pos: Vec2, center: Vec2, params: OrbitalParams): Vec2 => {
  const dx = center.x - pos.x;
  const dy = center.y - pos.y;
  const dist = Math.hypot(dx, dy);

  // Exactly on the centre: no defined inward direction, so no force.
  if (dist === 0) return vec(0, 0);

  const inX = dx / dist;
  const inY = dy / dist;

  // Perpendicular to the inward direction, signed by circulation direction.
  return vec(
    inX * params.centripetal + -inY * params.tangential * params.direction,
    inY * params.centripetal + inX * params.tangential * params.direction,
  );
};
