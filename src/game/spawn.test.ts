import { describe, expect, it } from 'vitest';
import { Rng } from '../core/Rng';
import { bodyRadiusFor, FLAG_COUNT, SIM } from '../config';
import { spawnPositions } from './spawn';

describe('spawnPositions', () => {
  it('returns exactly the requested number of positions', () => {
    const bodyRadius = bodyRadiusFor(FLAG_COUNT);
    expect(spawnPositions(200, SIM.arenaRadius, bodyRadius, new Rng(1))).toHaveLength(200);
    expect(spawnPositions(7, SIM.arenaRadius, bodyRadius, new Rng(1))).toHaveLength(7);
  });

  it('places every flag inside the arena wall', () => {
    const bodyRadius = bodyRadiusFor(FLAG_COUNT);
    const arenaRadius = SIM.arenaRadius;
    for (const p of spawnPositions(FLAG_COUNT, arenaRadius, bodyRadius, new Rng(2))) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(arenaRadius - bodyRadius);
    }
  });

  it('never overlaps two flags at spawn', () => {
    const bodyRadius = bodyRadiusFor(FLAG_COUNT);
    const points = spawnPositions(FLAG_COUNT, SIM.arenaRadius, bodyRadius, new Rng(3));
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y);
        expect(d).toBeGreaterThanOrEqual(bodyRadius * 2);
      }
    }
  });

  it('is deterministic for a given seed, and varies across seeds', () => {
    const bodyRadius = bodyRadiusFor(FLAG_COUNT);
    expect(spawnPositions(50, SIM.arenaRadius, bodyRadius, new Rng(9))).toEqual(
      spawnPositions(50, SIM.arenaRadius, bodyRadius, new Rng(9)),
    );
    expect(spawnPositions(50, SIM.arenaRadius, bodyRadius, new Rng(9))).not.toEqual(
      spawnPositions(50, SIM.arenaRadius, bodyRadius, new Rng(10)),
    );
  });

  it('throws rather than silently overlapping when the arena cannot hold the count', () => {
    expect(() => spawnPositions(5000, 200, bodyRadiusFor(FLAG_COUNT), new Rng(1))).toThrow(/cannot fit/i);
  });

  it('lays out the shipped configuration with room to spare', () => {
    // The real round: every flag, at the derived larger radius, in the real arena.
    const bodyRadius = bodyRadiusFor(FLAG_COUNT);
    expect(() =>
      spawnPositions(FLAG_COUNT, SIM.arenaRadius, bodyRadius, new Rng(1)),
    ).not.toThrow();
  });
});
