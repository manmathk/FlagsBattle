import { describe, expect, it } from 'vitest';
import { Arena } from './Arena';
import { fromAngle, vec } from './Vec2';

const closedArena = () => new Arena(vec(0, 0), 100, null);
const gappedArena = (centerAngle: number, width: number) =>
  new Arena(vec(0, 0), 100, { centerAngle, width });

describe('Arena', () => {
  describe('wallContact', () => {
    it('reports no contact for a body at the centre', () => {
      expect(closedArena().wallContact(vec(0, 0), 10)).toBeNull();
    });

    it('reports no contact while the body is clear of the wall', () => {
      // dist 85, wall for r=10 sits at 90
      expect(closedArena().wallContact(vec(85, 0), 10)).toBeNull();
    });

    it('reports contact once the body crosses the wall, with inward normal and depth', () => {
      const contact = closedArena().wallContact(vec(95, 0), 10);
      expect(contact).not.toBeNull();
      expect(contact!.depth).toBeCloseTo(5, 10);
      expect(contact!.normal.x).toBeCloseTo(-1, 10);
      expect(contact!.normal.y).toBeCloseTo(0, 10);
    });

    it('points the normal inward regardless of direction', () => {
      const contact = closedArena().wallContact(vec(0, 95), 10);
      expect(contact!.normal.x).toBeCloseTo(0, 10);
      expect(contact!.normal.y).toBeCloseTo(-1, 10);
    });

    it('respects a non-origin centre', () => {
      const arena = new Arena(vec(500, 300), 100, null);
      expect(arena.wallContact(vec(585, 300), 10)).toBeNull();
      const contact = arena.wallContact(vec(595, 300), 10);
      expect(contact!.depth).toBeCloseTo(5, 10);
      expect(contact!.normal.x).toBeCloseTo(-1, 10);
    });

    it('never reports escape through a gap when the arena is closed', () => {
      const contact = closedArena().wallContact(vec(95, 0), 10);
      expect(contact!.throughGap).toBe(false);
    });

    it('reports escape when the contact lies inside the gap arc', () => {
      const arena = gappedArena(0, 0.6);
      expect(arena.wallContact(vec(95, 0), 10)!.throughGap).toBe(true);
    });

    it('does not report escape for a contact outside the gap arc', () => {
      const arena = gappedArena(0, 0.6);
      const pos = fromAngle(Math.PI / 2, 95);
      expect(arena.wallContact(pos, 10)!.throughGap).toBe(false);
    });
  });

  describe('isAngleInGap', () => {
    it('covers exactly the half-width either side of the gap centre', () => {
      const arena = gappedArena(0, 0.6);
      expect(arena.isAngleInGap(0)).toBe(true);
      expect(arena.isAngleInGap(0.29)).toBe(true);
      expect(arena.isAngleInGap(-0.29)).toBe(true);
      expect(arena.isAngleInGap(0.31)).toBe(false);
      expect(arena.isAngleInGap(-0.31)).toBe(false);
    });

    it('wraps around pi without a discontinuity', () => {
      const arena = gappedArena(Math.PI, 0.6);
      expect(arena.isAngleInGap(Math.PI)).toBe(true);
      expect(arena.isAngleInGap(-Math.PI + 0.2)).toBe(true);
      expect(arena.isAngleInGap(Math.PI - 0.2)).toBe(true);
      expect(arena.isAngleInGap(Math.PI - 0.4)).toBe(false);
    });

    it('wraps around zero for a gap centred just above it', () => {
      const arena = gappedArena(0.1, 0.6);
      expect(arena.isAngleInGap(-0.15)).toBe(true);
      expect(arena.isAngleInGap(2 * Math.PI - 0.15)).toBe(true);
    });

    it('is always false when there is no gap', () => {
      const arena = closedArena();
      for (const a of [0, 1, -1, Math.PI]) expect(arena.isAngleInGap(a)).toBe(false);
    });
  });

  describe('isBeyondKillRadius', () => {
    it('is false inside and true well outside the arena', () => {
      const arena = closedArena();
      // kill radius is arena radius + 3 body radii
      expect(arena.isBeyondKillRadius(vec(120, 0), 10)).toBe(false);
      expect(arena.isBeyondKillRadius(vec(131, 0), 10)).toBe(true);
    });
  });
});
