import { SIM } from '../config';

/**
 * Fixed-timestep accumulator.
 *
 * Pure: it converts wall-clock frame deltas into a count of simulation steps and
 * knows nothing about requestAnimationFrame, so the pacing logic is testable
 * without a browser.
 */
export class GameLoop {
  private accumulator = 0;
  private isRunning = true;

  get running(): boolean {
    return this.isRunning;
  }

  /** Fraction of a step pending, for interpolating rendered positions. */
  get alpha(): number {
    return this.accumulator / SIM.fixedStep;
  }

  pause(): void {
    this.isRunning = false;
  }

  resume(): void {
    this.isRunning = true;
  }

  toggle(): void {
    this.isRunning = !this.isRunning;
  }

  reset(): void {
    this.accumulator = 0;
  }

  /** Number of fixed steps the caller should run for this frame delta. */
  advance(frameDt: number): number {
    if (!this.isRunning) return 0;

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= SIM.fixedStep && steps < SIM.maxStepsPerFrame) {
      this.accumulator -= SIM.fixedStep;
      steps++;
    }

    // Hitting the cap means we are irrecoverably behind (a backgrounded tab, a
    // long GC pause). Drop the backlog rather than trying to catch up forever.
    if (steps === SIM.maxStepsPerFrame && this.accumulator > SIM.fixedStep) {
      this.accumulator = 0;
    }
    return steps;
  }
}
