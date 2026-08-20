import { describe, expect, it } from 'vitest';
import { Leaderboard } from './Leaderboard';

describe('Leaderboard', () => {
  it('starts empty, with no last winner', () => {
    const board = new Leaderboard();
    expect(board.lastWinner).toBeNull();
    expect(board.roundsPlayed).toBe(0);
    expect(board.top(5)).toEqual([]);
  });

  it('remembers the most recent winner', () => {
    const board = new Leaderboard();
    board.recordWin('tr');
    board.recordWin('de');
    expect(board.lastWinner).toBe('de');
  });

  it('counts rounds played', () => {
    const board = new Leaderboard();
    for (const code of ['tr', 'de', 'tr']) board.recordWin(code);
    expect(board.roundsPlayed).toBe(3);
  });

  it('tallies repeat wins', () => {
    const board = new Leaderboard();
    board.recordWin('tr');
    board.recordWin('tr');
    expect(board.winsFor('tr')).toBe(2);
    expect(board.winsFor('never')).toBe(0);
  });

  it('ranks by wins, descending', () => {
    const board = new Leaderboard();
    for (const code of ['de', 'tr', 'tr', 'fr', 'fr', 'fr']) board.recordWin(code);
    expect(board.top(3)).toEqual([
      { flagCode: 'fr', wins: 3 },
      { flagCode: 'tr', wins: 2 },
      { flagCode: 'de', wins: 1 },
    ]);
  });

  it('breaks ties stably by code, so rows do not jump around', () => {
    const board = new Leaderboard();
    board.recordWin('zw');
    board.recordWin('ad');
    expect(board.top(2)).toEqual([
      { flagCode: 'ad', wins: 1 },
      { flagCode: 'zw', wins: 1 },
    ]);
  });

  it('returns only the requested number of rows', () => {
    const board = new Leaderboard();
    for (const code of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']) board.recordWin(code);
    expect(board.top(5)).toHaveLength(5);
  });

  it('returns everything it has when asked for more than it holds', () => {
    const board = new Leaderboard();
    board.recordWin('tr');
    expect(board.top(5)).toHaveLength(1);
  });

  it('clears completely on reset', () => {
    const board = new Leaderboard();
    board.recordWin('tr');
    board.recordWin('de');
    board.reset();
    expect(board.lastWinner).toBeNull();
    expect(board.roundsPlayed).toBe(0);
    expect(board.top(5)).toEqual([]);
    expect(board.winsFor('tr')).toBe(0);
  });
});
