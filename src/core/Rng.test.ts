import { describe, expect, it } from 'vitest';
import { Rng } from './Rng';

describe('Rng', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('emits values in [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('does not get stuck on a constant', () => {
    const rng = new Rng(7);
    const values = new Set(Array.from({ length: 50 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(40);
  });

  describe('range', () => {
    it('stays within the requested bounds', () => {
      const rng = new Rng(4);
      for (let i = 0; i < 500; i++) {
        const v = rng.range(10, 20);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThan(20);
      }
    });
  });

  describe('int', () => {
    it('covers the full inclusive-exclusive integer span', () => {
      const rng = new Rng(5);
      const seen = new Set<number>();
      for (let i = 0; i < 500; i++) seen.add(rng.int(0, 4));
      expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    });
  });

  describe('pick', () => {
    it('returns an element of the array', () => {
      const rng = new Rng(6);
      const items = ['a', 'b', 'c'];
      for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
    });
  });

  describe('shuffle', () => {
    it('preserves every element exactly once', () => {
      const rng = new Rng(8);
      const input = Array.from({ length: 50 }, (_, i) => i);
      const out = rng.shuffle([...input]);
      expect([...out].sort((x, y) => x - y)).toEqual(input);
    });

    it('changes the order', () => {
      const rng = new Rng(8);
      const input = Array.from({ length: 50 }, (_, i) => i);
      expect(rng.shuffle([...input])).not.toEqual(input);
    });
  });
});
