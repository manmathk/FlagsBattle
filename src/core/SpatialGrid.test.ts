import { describe, expect, it } from 'vitest';
import { SpatialGrid } from './SpatialGrid';
import { Rng } from './Rng';

const collectPairs = (grid: SpatialGrid): Array<[number, number]> => {
  const pairs: Array<[number, number]> = [];
  grid.forEachCandidatePair((a, b) => pairs.push(a < b ? [a, b] : [b, a]));
  return pairs;
};

const key = ([a, b]: [number, number]) => `${a}-${b}`;

describe('SpatialGrid', () => {
  it('yields no pairs when empty', () => {
    expect(collectPairs(new SpatialGrid(10))).toEqual([]);
  });

  it('yields no pairs for a single body', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, 5, 5);
    expect(collectPairs(grid)).toEqual([]);
  });

  it('pairs two bodies sharing a cell', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, 1, 1);
    grid.insert(1, 2, 2);
    expect(collectPairs(grid)).toEqual([[0, 1]]);
  });

  it('pairs two bodies across a cell boundary', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, 9.5, 5);
    grid.insert(1, 10.5, 5);
    expect(collectPairs(grid)).toEqual([[0, 1]]);
  });

  it('pairs two bodies in diagonally adjacent cells', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, 9.5, 9.5);
    grid.insert(1, 10.5, 10.5);
    expect(collectPairs(grid)).toEqual([[0, 1]]);
  });

  it('pairs across the anti-diagonal too', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, 10.5, 9.5);
    grid.insert(1, 9.5, 10.5);
    expect(collectPairs(grid)).toEqual([[0, 1]]);
  });

  it('does not pair bodies more than a cell apart', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, 5, 5);
    grid.insert(1, 85, 85);
    expect(collectPairs(grid)).toEqual([]);
  });

  it('handles negative coordinates', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, -5, -5);
    grid.insert(1, -6, -6);
    expect(collectPairs(grid)).toEqual([[0, 1]]);
  });

  it('pairs across the origin boundary', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, -0.5, -0.5);
    grid.insert(1, 0.5, 0.5);
    expect(collectPairs(grid)).toEqual([[0, 1]]);
  });

  it('drops everything on clear', () => {
    const grid = new SpatialGrid(10);
    grid.insert(0, 1, 1);
    grid.insert(1, 2, 2);
    grid.clear();
    expect(collectPairs(grid)).toEqual([]);
  });

  it('never misses a genuinely close pair (checked against brute force)', () => {
    const cellSize = 20;
    const rng = new Rng(4242);
    const points = Array.from({ length: 300 }, () => ({
      x: rng.range(-500, 500),
      y: rng.range(-500, 500),
    }));

    const grid = new SpatialGrid(cellSize);
    points.forEach((p, i) => grid.insert(i, p.x, p.y));
    const found = new Set(collectPairs(grid).map(key));

    // Ground truth from an independent O(n^2) sweep: any pair within one cell
    // size must be offered as a candidate, or a real collision would be missed.
    let checked = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!;
        const b = points[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) <= cellSize) {
          checked++;
          expect(found.has(key([i, j]))).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('offers each pair at most once', () => {
    const rng = new Rng(77);
    const grid = new SpatialGrid(20);
    for (let i = 0; i < 300; i++) grid.insert(i, rng.range(-200, 200), rng.range(-200, 200));

    const pairs = collectPairs(grid).map(key);
    expect(pairs.length).toBe(new Set(pairs).size);
  });
});
