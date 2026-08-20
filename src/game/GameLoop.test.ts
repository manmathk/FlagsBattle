import { describe, expect, it } from 'vitest';
import { GameLoop } from './GameLoop';
import { SIM } from '../config';

const STEP = SIM.fixedStep;

describe('GameLoop', () => {
  it('runs no steps until enough time has accumulated', () => {
    const loop = new GameLoop();
    expect(loop.advance(STEP / 2)).toBe(0);
  });

  it('runs one step per fixed interval of elapsed time', () => {
    const loop = new GameLoop();
    expect(loop.advance(STEP)).toBe(1);
    expect(loop.advance(STEP * 3)).toBe(3);
  });

  it('carries the remainder into the next frame instead of dropping it', () => {
    const loop = new GameLoop();
    expect(loop.advance(STEP * 1.5)).toBe(1);
    expect(loop.advance(STEP * 0.5)).toBe(1);
  });

  it('caps catch-up steps so a stalled tab cannot death-spiral', () => {
    const loop = new GameLoop();
    expect(loop.advance(STEP * 500)).toBe(SIM.maxStepsPerFrame);
  });

  it('discards the backlog when it hits the cap, rather than staying behind forever', () => {
    const loop = new GameLoop();
    loop.advance(STEP * 500);
    expect(loop.advance(STEP)).toBe(1);
  });

  it('runs nothing while paused', () => {
    const loop = new GameLoop();
    loop.pause();
    expect(loop.advance(STEP * 10)).toBe(0);
    expect(loop.running).toBe(false);
  });

  it('resumes from a pause', () => {
    const loop = new GameLoop();
    loop.pause();
    loop.advance(STEP * 10);
    loop.resume();
    expect(loop.advance(STEP)).toBe(1);
  });

  it('starts out running, because the page auto-starts', () => {
    expect(new GameLoop().running).toBe(true);
  });

  it('drops any accumulated time on reset', () => {
    const loop = new GameLoop();
    loop.advance(STEP * 0.9);
    loop.reset();
    expect(loop.alpha).toBe(0);
    // The dropped 0.9 does not carry over, so this no longer completes a step.
    expect(loop.advance(STEP * 0.2)).toBe(0);
  });

  it('reports interpolation alpha as the fraction of a step still pending', () => {
    const loop = new GameLoop();
    loop.advance(STEP * 1.5);
    expect(loop.alpha).toBeCloseTo(0.5, 6);
  });

  it('keeps alpha within [0, 1)', () => {
    const loop = new GameLoop();
    for (const dt of [STEP * 0.1, STEP * 2.7, STEP * 500, STEP * 0.99]) {
      loop.advance(dt);
      expect(loop.alpha).toBeGreaterThanOrEqual(0);
      expect(loop.alpha).toBeLessThan(1);
    }
  });
});
