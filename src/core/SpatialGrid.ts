/**
 * Uniform-grid broad phase.
 *
 * With 200 bodies a naive sweep is ~20,000 pair checks per step. Bucketing by
 * cell and only visiting neighbouring cells cuts that to roughly 1-2k. Cell size
 * should be the body diameter: any two overlapping bodies then land either in the
 * same cell or in adjacent ones.
 *
 * Each unordered pair is offered exactly once. Duplicates would be worse than a
 * performance problem — resolving the same collision twice in a step injects
 * energy and the pack slowly boils.
 */

/** Cell coordinates are packed into one integer key; this bounds them. */
const COORD_OFFSET = 1 << 15;
const COORD_LIMIT = 1 << 16;

/**
 * Only half the neighbourhood is visited. Combined with the same-cell sweep,
 * this covers all 8 neighbours across the grid as a whole while offering each
 * pair once: a pair in cells A and B is emitted only when visiting the earlier one.
 */
const FORWARD_NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];

export class SpatialGrid {
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly cellSize: number) {
    if (cellSize <= 0) throw new Error('SpatialGrid: cellSize must be positive');
  }

  clear(): void {
    this.cells.clear();
  }

  insert(index: number, x: number, y: number): void {
    const cell = this.cellFor(x, y);
    const bucket = this.cells.get(cell);
    if (bucket === undefined) this.cells.set(cell, [index]);
    else bucket.push(index);
  }

  forEachCandidatePair(visit: (a: number, b: number) => void): void {
    for (const [cellKey, bucket] of this.cells) {
      // Pairs inside this cell.
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          visit(bucket[i]!, bucket[j]!);
        }
      }

      // Pairs spanning into the forward half of the neighbourhood.
      const cx = Math.floor(cellKey / COORD_LIMIT) - COORD_OFFSET;
      const cy = (cellKey % COORD_LIMIT) - COORD_OFFSET;
      for (const [dx, dy] of FORWARD_NEIGHBOURS) {
        const other = this.cells.get(this.keyFor(cx + dx, cy + dy));
        if (other === undefined) continue;
        for (const a of bucket) {
          for (const b of other) visit(a, b);
        }
      }
    }
  }

  private cellFor(x: number, y: number): number {
    return this.keyFor(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  private keyFor(cx: number, cy: number): number {
    return (cx + COORD_OFFSET) * COORD_LIMIT + (cy + COORD_OFFSET);
  }
}
