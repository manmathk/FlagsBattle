import { describe, expect, it, vi } from 'vitest';
import { CHAMPION_HOLD, Match, WINNER_HOLD } from './Match';
import { SERIES_TARGET } from './Series';
import { SIM } from '../config';

const DT = SIM.fixedStep;
const codes = Array.from({ length: 30 }, (_, i) => `c${i}`);

/** Advance a match until a predicate holds, or give up. */
const advanceUntil = (match: Match, predicate: () => boolean, maxSeconds = 600): boolean => {
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps; i++) {
    match.step(DT);
    if (predicate()) return true;
  }
  return false;
};

describe('Match', () => {
  it('hands the series to onRoundStart, which fires during construction', () => {
    // Reaching for the Match from this callback would hit it before
    // initialisation, so the series is passed in instead.
    let seen: unknown = 'not called';
    const match = new Match('normal', codes, 1, {
      onRoundStart: (_round, series) => {
        seen = series.standings();
      },
    });
    expect(seen).toEqual([]);
    expect(match.round.status).toBe('running');
  });

  it('starts a round immediately, without waiting for input', () => {
    const match = new Match('normal', codes, 1);
    expect(match.phase).toBe('running');
    expect(match.round.status).toBe('running');
    expect(match.round.world.bodies).toHaveLength(codes.length);
  });

  it('enters an intermission when a round resolves', () => {
    const match = new Match('normal', codes, 2);
    expect(advanceUntil(match, () => match.phase === 'intermission')).toBe(true);
  });

  it('starts the next round automatically after the intermission', () => {
    const match = new Match('normal', codes, 3);
    advanceUntil(match, () => match.phase === 'intermission');
    const finished = match.round;

    // Just short of the hold: still waiting.
    for (let i = 0; i < Math.round((WINNER_HOLD - 0.1) / DT); i++) match.step(DT);
    expect(match.phase).toBe('intermission');
    expect(match.round).toBe(finished);

    for (let i = 0; i < Math.round(0.2 / DT); i++) match.step(DT);
    expect(match.phase).toBe('running');
    expect(match.round).not.toBe(finished);
  });

  it('keeps producing rounds indefinitely', () => {
    const onRoundStart = vi.fn();
    const match = new Match('normal', codes, 4, { onRoundStart });
    advanceUntil(match, () => onRoundStart.mock.calls.length >= 4, 2000);
    expect(onRoundStart.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('gives each round its own seed, so rounds are not identical', () => {
    const starts: number[] = [];
    const match = new Match('normal', codes, 5, {
      onRoundStart: (round) => starts.push(round.world.bodies[0]!.pos.x),
    });
    advanceUntil(match, () => starts.length >= 3, 2000);
    expect(new Set(starts).size).toBeGreaterThan(1);
  });

  it('reports a winner drawn from the entrants', () => {
    const onRoundEnd = vi.fn();
    const match = new Match('normal', codes, 6, { onRoundEnd });
    advanceUntil(match, () => onRoundEnd.mock.calls.length >= 1);
    expect(codes).toContain(onRoundEnd.mock.calls[0]![0].winnerCode);
  });

  describe('series', () => {
    it('accumulates wins in Normal mode', () => {
      const match = new Match('normal', codes, 7);
      advanceUntil(match, () => match.series.standings().length >= 2, 2000);
      const total = match.series.standings().reduce((acc, s) => acc + s.wins, 0);
      expect(total).toBeGreaterThanOrEqual(2);
    });

    it('does not track a series in Lightning or Chaos', () => {
      for (const mode of ['lightning', 'chaos'] as const) {
        const match = new Match(mode, codes, 8);
        advanceUntil(match, () => match.phase === 'intermission');
        expect(match.series.standings()).toEqual([]);
      }
    });

    it('crowns a champion and holds the banner longer', () => {
      const results: Array<{ winnerCode: string; isChampion: boolean }> = [];
      const match = new Match('normal', codes, 11, {
        onRoundEnd: (result) => results.push(result),
      });
      const crowned = advanceUntil(match, () => results.some((r) => r.isChampion), 6000);

      expect(crowned).toBe(true);
      const champion = results.find((r) => r.isChampion)!;
      // The champion must have taken the target number of rounds.
      const wins = results.filter((r) => r.winnerCode === champion.winnerCode).length;
      expect(wins).toBe(SERIES_TARGET);
      expect(CHAMPION_HOLD).toBeGreaterThan(WINNER_HOLD);
    });

    it('clears the board after a champion, so the page keeps going', () => {
      const results: Array<{ isChampion: boolean }> = [];
      const match = new Match('normal', codes, 11, {
        onRoundEnd: (result) => results.push(result),
      });
      advanceUntil(match, () => results.some((r) => r.isChampion), 6000);
      expect(match.series.champion).toBeNull();
    });
  });

  describe('leaderboard', () => {
    it('records the winner of every round', () => {
      const match = new Match('normal', codes, 20);
      advanceUntil(match, () => match.leaderboard.roundsPlayed >= 3, 2000);
      expect(match.leaderboard.roundsPlayed).toBeGreaterThanOrEqual(3);
      const tallied = match.leaderboard.standings().reduce((acc, s) => acc + s.wins, 0);
      expect(tallied).toBe(match.leaderboard.roundsPlayed);
    });

    it('tallies in modes that run no series', () => {
      for (const mode of ['lightning', 'chaos'] as const) {
        const match = new Match(mode, codes, 21);
        advanceUntil(match, () => match.leaderboard.roundsPlayed >= 1, 2000);
        expect(match.leaderboard.roundsPlayed).toBe(1);
        expect(match.series.standings()).toEqual([]);
      }
    });

    it('agrees with the reported round winner', () => {
      const results: string[] = [];
      const match = new Match('lightning', codes, 22, {
        onRoundEnd: (result) => results.push(result.winnerCode),
      });
      advanceUntil(match, () => results.length >= 2, 2000);
      expect(match.leaderboard.lastWinner).toBe(results[results.length - 1]);
    });

    it('survives a champion being crowned', () => {
      // The series clears at that point; the session tally must not.
      const results: Array<{ isChampion: boolean }> = [];
      const match = new Match('normal', codes, 11, {
        onRoundEnd: (result) => results.push(result),
      });
      advanceUntil(match, () => results.some((r) => r.isChampion), 6000);
      expect(match.series.champion).toBeNull();
      expect(match.leaderboard.roundsPlayed).toBeGreaterThanOrEqual(3);
    });

    it('survives a mode switch, so it reads as a session tally', () => {
      const match = new Match('normal', codes, 23);
      advanceUntil(match, () => match.leaderboard.roundsPlayed >= 1, 2000);
      const before = match.leaderboard.roundsPlayed;

      match.setMode('chaos');
      expect(match.leaderboard.roundsPlayed).toBe(before);
    });

    it('is cleared by a reset', () => {
      const match = new Match('normal', codes, 24);
      advanceUntil(match, () => match.leaderboard.roundsPlayed >= 1, 2000);

      match.reset();
      expect(match.leaderboard.roundsPlayed).toBe(0);
      expect(match.leaderboard.lastWinner).toBeNull();
    });
  });

  describe('reset', () => {
    it('starts a fresh round and clears the series', () => {
      const match = new Match('normal', codes, 12);
      advanceUntil(match, () => match.series.standings().length >= 1, 2000);
      const previous = match.round;

      match.reset();
      expect(match.round).not.toBe(previous);
      expect(match.phase).toBe('running');
      expect(match.series.standings()).toEqual([]);
      expect(match.round.world.aliveCount).toBe(codes.length);
    });

    it('recovers from mid-intermission', () => {
      const match = new Match('normal', codes, 13);
      advanceUntil(match, () => match.phase === 'intermission');
      match.reset();
      expect(match.phase).toBe('running');
      expect(match.round.status).toBe('running');
    });
  });

  describe('setMode', () => {
    it('switches mode and restarts', () => {
      const match = new Match('normal', codes, 14);
      expect(match.mode.id).toBe('normal');
      match.setMode('chaos');
      expect(match.mode.id).toBe('chaos');
      expect(match.round.status).toBe('running');
      expect(match.round.world.aliveCount).toBe(codes.length);
    });

    it('abandons a series in progress', () => {
      const match = new Match('normal', codes, 15);
      advanceUntil(match, () => match.series.standings().length >= 1, 2000);
      match.setMode('lightning');
      expect(match.series.standings()).toEqual([]);
    });
  });
});
