import { describe, expect, it } from 'vitest';
import { Series, SERIES_TARGET } from './Series';

describe('Series', () => {
  it('starts with no champion and no wins', () => {
    const series = new Series();
    expect(series.champion).toBeNull();
    expect(series.standings()).toEqual([]);
  });

  it('counts repeated wins for the same flag', () => {
    const series = new Series();
    series.recordWin('tr');
    series.recordWin('tr');
    expect(series.winsFor('tr')).toBe(2);
  });

  it('withholds the champion until the target is reached', () => {
    const series = new Series();
    for (let i = 0; i < SERIES_TARGET - 1; i++) series.recordWin('tr');
    expect(series.champion).toBeNull();
    series.recordWin('tr');
    expect(series.champion).toBe('tr');
  });

  it('does not crown a flag on someone else’s wins', () => {
    const series = new Series();
    series.recordWin('tr');
    series.recordWin('de');
    series.recordWin('fr');
    expect(series.champion).toBeNull();
  });

  it('ranks standings by wins, descending', () => {
    const series = new Series();
    series.recordWin('de');
    series.recordWin('tr');
    series.recordWin('tr');
    expect(series.standings()).toEqual([
      { flagCode: 'tr', wins: 2 },
      { flagCode: 'de', wins: 1 },
    ]);
  });

  it('clears everything on reset', () => {
    const series = new Series();
    for (let i = 0; i < SERIES_TARGET; i++) series.recordWin('tr');
    series.reset();
    expect(series.champion).toBeNull();
    expect(series.standings()).toEqual([]);
    expect(series.winsFor('tr')).toBe(0);
  });
});
