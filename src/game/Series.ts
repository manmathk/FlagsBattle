import { Leaderboard, type Standing } from './Leaderboard';

export type { Standing };

/** Round wins needed to take the series. */
export const SERIES_TARGET = 3;

/**
 * First-to-three round wins takes the series.
 *
 * (The source material described the format as both "best of 3" and "first to 3
 * victories"; the design resolved that in favour of first-to-3.)
 *
 * Shares the tally implementation with the session leaderboard but not its
 * lifetime — a series clears the moment a champion is crowned.
 */
export class Series {
  private readonly tally = new Leaderboard();

  recordWin(flagCode: string): void {
    this.tally.recordWin(flagCode);
  }

  winsFor(flagCode: string): number {
    return this.tally.winsFor(flagCode);
  }

  get champion(): string | null {
    for (const standing of this.tally.standings()) {
      if (standing.wins >= SERIES_TARGET) return standing.flagCode;
    }
    return null;
  }

  standings(): Standing[] {
    return this.tally.standings();
  }

  reset(): void {
    this.tally.reset();
  }
}
