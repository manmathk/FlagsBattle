import type { Vec2 } from './Vec2';

/**
 * `falling` means the body has passed through the gap and is on its way out: it
 * no longer collides with anything, and becomes `eliminated` once it clears the
 * kill radius.
 */
export type BodyState = 'alive' | 'falling' | 'eliminated';

export interface Body {
  readonly id: number;
  readonly flagCode: string;
  pos: Vec2;
  /** Position at the previous step, for render interpolation. */
  prevPos: Vec2;
  vel: Vec2;
  /** Sprite rotation, radians. Purely driven by contact friction. */
  angle: number;
  angularVel: number;
  state: BodyState;
  /** Lightning telegraph marker: struck imminently, still alive. */
  targeted: boolean;
  /** Step index at elimination, or -1. Gives round resolution a total order. */
  eliminatedAtStep: number;
}

export const createBody = (
  id: number,
  flagCode: string,
  pos: Vec2,
  vel: Vec2,
  angle = 0,
): Body => ({
  id,
  flagCode,
  pos: { ...pos },
  prevPos: { ...pos },
  vel: { ...vel },
  angle,
  angularVel: 0,
  state: 'alive',
  targeted: false,
  eliminatedAtStep: -1,
});
