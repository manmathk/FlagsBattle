import type { Rng } from '../core/Rng';
import { vec, type Vec2 } from '../core/Vec2';

/**
 * Spacing as a multiple of body diameter. Just above 1 so flags start touching
 * but not overlapping — the pack is dense from the first frame without the
 * physics having to shove hundreds of overlaps apart on step one.
 */
const SPACING_FACTOR = 1.04;

/**
 * Non-overlapping start positions on a hexagonal lattice clipped to the arena
 * disc, then shuffled so which flag lands where is seed-dependent.
 *
 * A sunflower/phyllotaxis spiral looks tidier but packs far less densely — at 200
 * flags it puts neighbours ~31px apart when they need 48, so every round would
 * open with hundreds of overlapping pairs exploding outward.
 */
export const spawnPositions = (
  count: number,
  arenaRadius: number,
  bodyRadius: number,
  rng: Rng,
): Vec2[] => {
  const spacing = bodyRadius * 2 * SPACING_FACTOR;
  const limit = arenaRadius - bodyRadius;
  const rowHeight = spacing * (Math.sqrt(3) / 2);
  const rows = Math.ceil((limit * 2) / rowHeight) + 2;

  const slots: Vec2[] = [];
  for (let row = -rows; row <= rows; row++) {
    const y = row * rowHeight;
    // Offset every other row by half a step: that is what makes it hexagonal
    // rather than square, and buys ~15% more capacity.
    const xOffset = (row % 2 === 0 ? 0 : spacing / 2);
    const span = Math.ceil((limit * 2) / spacing) + 2;
    for (let col = -span; col <= span; col++) {
      const x = col * spacing + xOffset;
      if (Math.hypot(x, y) <= limit) slots.push(vec(x, y));
    }
  }

  if (slots.length < count) {
    throw new Error(
      `spawnPositions: arena cannot fit ${count} flags of radius ${bodyRadius} ` +
        `(capacity ${slots.length})`,
    );
  }

  // Shuffle before slicing so the chosen subset is spread over the whole disc,
  // not just the middle.
  return rng.shuffle(slots).slice(0, count);
};
