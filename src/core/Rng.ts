/**
 * Seeded pseudo-random generator (mulberry32).
 *
 * Every source of randomness in the simulation goes through this, so a round is
 * fully reproducible from its seed. That is what lets the headless tests assert
 * real invariants instead of just "it didn't throw".
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Zero is a fixed point for the mixing function, so nudge it off.
    this.state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length)]!;
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
