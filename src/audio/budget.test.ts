import { describe, expect, it } from 'vitest';
import { SoundBudget } from './budget';

const budget = () =>
  new SoundBudget({
    impact: { maxPerFrame: 3, cooldownMs: 25 },
    elimination: { maxPerFrame: 2, cooldownMs: 0 },
  });

describe('SoundBudget', () => {
  it('allows up to the per-frame cap', () => {
    const b = budget();
    b.beginFrame(1000);
    expect(b.allow('impact')).toBe(true);
    expect(b.allow('impact')).toBe(true);
    expect(b.allow('impact')).toBe(true);
    // 197 orbiting bodies generate hundreds of impacts a second; the cap is what
    // keeps that from becoming white noise and a CPU spike.
    expect(b.allow('impact')).toBe(false);
  });

  it('refills the per-frame cap on the next frame', () => {
    const b = budget();
    b.beginFrame(1000);
    for (let i = 0; i < 5; i++) b.allow('impact');

    b.beginFrame(2000);
    expect(b.allow('impact')).toBe(true);
  });

  it('keeps separate budgets per kind', () => {
    const b = budget();
    b.beginFrame(1000);
    for (let i = 0; i < 5; i++) b.allow('impact');
    // Impacts are exhausted; eliminations must be unaffected.
    expect(b.allow('elimination')).toBe(true);
  });

  it('enforces the cooldown across frames', () => {
    const b = budget();
    b.beginFrame(1000);
    expect(b.allow('impact')).toBe(true);

    b.beginFrame(1010); // only 10ms later
    expect(b.allow('impact')).toBe(false);

    b.beginFrame(1030); // past the 25ms cooldown
    expect(b.allow('impact')).toBe(true);
  });

  it('treats a zero cooldown as no cooldown', () => {
    const b = budget();
    b.beginFrame(1000);
    expect(b.allow('elimination')).toBe(true);
    b.beginFrame(1001);
    expect(b.allow('elimination')).toBe(true);
  });

  it('does not start the cooldown from a denied attempt', () => {
    const b = budget();
    b.beginFrame(1000);
    b.allow('impact');
    b.beginFrame(1005);
    expect(b.allow('impact')).toBe(false); // denied, must not reset the clock
    b.beginFrame(1030); // 30ms after the sound that actually played
    expect(b.allow('impact')).toBe(true);
  });

  it('allows kinds it has no limits for', () => {
    const b = budget();
    b.beginFrame(1000);
    // Rare one-shots (lightning, a winner sting) need no throttling.
    for (let i = 0; i < 10; i++) expect(b.allow('winner')).toBe(true);
  });

  it('denies everything before the first frame begins', () => {
    // Guards against a caller wiring sounds up before the loop starts.
    expect(new SoundBudget({}).allow('impact')).toBe(false);
  });
});
