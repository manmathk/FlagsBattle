import { describe, expect, it } from 'vitest';
import { add, angleOf, dot, fromAngle, length, lengthSq, normalize, scale, sub, vec } from './Vec2';

describe('Vec2', () => {
  it('computes length from a known 3-4-5 triangle', () => {
    expect(length(vec(3, 4))).toBe(5);
    expect(lengthSq(vec(3, 4))).toBe(25);
  });

  it('has zero length at the origin', () => {
    expect(length(vec(0, 0))).toBe(0);
  });

  it('adds, subtracts and scales componentwise', () => {
    expect(add(vec(1, 2), vec(3, 5))).toEqual(vec(4, 7));
    expect(sub(vec(1, 2), vec(3, 5))).toEqual(vec(-2, -3));
    expect(scale(vec(2, -3), 4)).toEqual(vec(8, -12));
  });

  it('computes a known dot product, and zero for perpendicular vectors', () => {
    expect(dot(vec(3, 4), vec(2, 1))).toBe(10);
    expect(dot(vec(1, 0), vec(0, 1))).toBe(0);
  });

  describe('normalize', () => {
    it('turns a 3-4-5 vector into the expected unit vector', () => {
      const n = normalize(vec(3, 4));
      expect(n.x).toBeCloseTo(0.6, 10);
      expect(n.y).toBeCloseTo(0.8, 10);
      expect(length(n)).toBeCloseTo(1, 10);
    });

    it('returns zero for the zero vector rather than NaN', () => {
      expect(normalize(vec(0, 0))).toEqual(vec(0, 0));
    });
  });

  describe('fromAngle', () => {
    it('maps quarter turns onto the expected axes', () => {
      const right = fromAngle(0, 1);
      expect(right.x).toBeCloseTo(1, 10);
      expect(right.y).toBeCloseTo(0, 10);

      const down = fromAngle(Math.PI / 2, 2);
      expect(down.x).toBeCloseTo(0, 10);
      expect(down.y).toBeCloseTo(2, 10);

      const left = fromAngle(Math.PI, 1);
      expect(left.x).toBeCloseTo(-1, 10);
      expect(left.y).toBeCloseTo(0, 10);
    });
  });

  describe('angleOf', () => {
    it('round-trips with fromAngle', () => {
      for (const angle of [0, 0.4, 1.5, 3, -2]) {
        expect(angleOf(fromAngle(angle, 3))).toBeCloseTo(angle, 10);
      }
    });
  });
});
