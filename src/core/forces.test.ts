import { describe, expect, it } from 'vitest';
import { orbitalForce } from './forces';
import { length, vec } from './Vec2';

const params = { centripetal: 900, tangential: 500, direction: 1 as 1 | -1 };

describe('orbitalForce', () => {
  it('pulls straight inward from the +x side', () => {
    const f = orbitalForce(vec(200, 0), vec(0, 0), { ...params, tangential: 0 });
    expect(f.x).toBeCloseTo(-900, 6);
    expect(f.y).toBeCloseTo(0, 6);
  });

  it('pulls straight inward from the -y side', () => {
    const f = orbitalForce(vec(0, -200), vec(0, 0), { ...params, tangential: 0 });
    expect(f.x).toBeCloseTo(0, 6);
    expect(f.y).toBeCloseTo(900, 6);
  });

  it('adds a tangential component perpendicular to the inward pull', () => {
    const f = orbitalForce(vec(200, 0), vec(0, 0), params);
    // Inward is -x, so the tangent must be along y.
    expect(f.x).toBeCloseTo(-900, 6);
    expect(Math.abs(f.y)).toBeCloseTo(500, 6);
  });

  it('combines to the expected total magnitude', () => {
    const f = orbitalForce(vec(0, 300), vec(0, 0), params);
    expect(length(f)).toBeCloseTo(Math.hypot(900, 500), 6);
  });

  it('reverses circulation with the direction flag', () => {
    const cw = orbitalForce(vec(200, 0), vec(0, 0), { ...params, direction: 1 });
    const ccw = orbitalForce(vec(200, 0), vec(0, 0), { ...params, direction: -1 });
    expect(cw.y).toBeCloseTo(-ccw.y, 6);
    // The inward pull is unaffected by circulation direction.
    expect(cw.x).toBeCloseTo(ccw.x, 6);
  });

  it('is measured from the arena centre, not the origin', () => {
    const f = orbitalForce(vec(500, 300), vec(300, 300), { ...params, tangential: 0 });
    expect(f.x).toBeCloseTo(-900, 6);
    expect(f.y).toBeCloseTo(0, 6);
  });

  it('returns zero at the centre rather than NaN', () => {
    // A body exactly on the centre has no defined inward direction.
    const f = orbitalForce(vec(50, 50), vec(50, 50), params);
    expect(f).toEqual(vec(0, 0));
  });

  it('keeps the magnitude constant regardless of distance', () => {
    // A uniform field, not an inverse-square one: orbit radius is then set by
    // speed alone, which is what makes the centrifuge tunable.
    const near = orbitalForce(vec(10, 0), vec(0, 0), params);
    const far = orbitalForce(vec(450, 0), vec(0, 0), params);
    expect(length(near)).toBeCloseTo(length(far), 6);
  });
});
