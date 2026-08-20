export interface Standing {
  flagCode: string;
  wins: number;
}

/**
 * Running tally of round wins.
 *
 * Distinct from `Series`, and deliberately so: a series is a short first-to-three
 * race that clears the moment a champion is crowned, whereas this accumulates
 * across every round and every mode and is only cleared by the Reset button. It
 * is what the results card reads.
 */
export class Leaderboard {
  private wins = new Map<string, number>();
  private latest: string | null = null;
  private rounds = 0;

  get lastWinner(): string | null {
    return this.latest;
  }

  get roundsPlayed(): number {
    return this.rounds;
  }

  recordWin(flagCode: string): void {
    this.wins.set(flagCode, (this.wins.get(flagCode) ?? 0) + 1);
    this.latest = flagCode;
    this.rounds++;
  }

  winsFor(flagCode: string): number {
    return this.wins.get(flagCode) ?? 0;
  }

  standings(): Standing[] {
    return [...this.wins.entries()]
      .map(([flagCode, wins]) => ({ flagCode, wins }))
      // Code as the tiebreak keeps equal rows in a stable order rather than
      // letting them swap places as the map is rebuilt.
      .sort((a, b) => b.wins - a.wins || a.flagCode.localeCompare(b.flagCode));
  }

  top(count: number): Standing[] {
    return this.standings().slice(0, count);
  }

  reset(): void {
    this.wins = new Map();
    this.latest = null;
    this.rounds = 0;
  }
}
