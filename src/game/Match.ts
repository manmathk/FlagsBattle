import { Rng } from '../core/Rng';
import type { GameMode, ModeId } from '../modes/GameMode';
import { ChaosMode } from '../modes/ChaosMode';
import { LightningMode } from '../modes/LightningMode';
import { NormalMode } from '../modes/NormalMode';
import { Leaderboard } from './Leaderboard';
import { Round } from './Round';
import { Series } from './Series';

/** Seconds the winner banner holds before the next round starts. */
export const WINNER_HOLD = 4;

/** Longer hold when a series is decided. */
export const CHAMPION_HOLD = 7;

export type MatchPhase = 'running' | 'intermission';

export interface RoundResult {
  winnerCode: string;
  /** True when this win decided the series. */
  isChampion: boolean;
}

/**
 * The live series is handed to the callbacks rather than being reached for
 * through the Match. `onRoundStart` fires from the constructor, so a caller that
 * closed over the Match itself would hit it before initialisation.
 */
export interface MatchCallbacks {
  onRoundStart?: (round: Round, series: Series, leaderboard: Leaderboard) => void;
  onRoundEnd?: (result: RoundResult, series: Series, leaderboard: Leaderboard) => void;
}

export const createMode = (id: ModeId): GameMode => {
  switch (id) {
    case 'normal':
      return new NormalMode();
    case 'lightning':
      return new LightningMode();
    case 'chaos':
      return new ChaosMode();
  }
};

/**
 * Runs rounds back to back forever.
 *
 * Rounds auto-advance through a short intermission, and Normal mode carries a
 * first-to-three series across them. Nothing here waits on user input: the page
 * is expected to be left running unattended.
 */
export class Match {
  readonly series = new Series();
  /**
   * Session tally behind the results card. Unlike the series it spans every mode
   * and survives mode switches — only the Reset button clears it.
   */
  readonly leaderboard = new Leaderboard();
  round: Round;
  phase: MatchPhase = 'running';

  private modeId: ModeId;
  private intermission = 0;
  private readonly seeds: Rng;

  constructor(
    modeId: ModeId,
    private readonly flagCodes: readonly string[],
    seed: number,
    private readonly callbacks: MatchCallbacks = {},
  ) {
    this.modeId = modeId;
    this.seeds = new Rng(seed);
    this.round = this.startRound();
  }

  get mode(): GameMode {
    return this.round.mode;
  }

  step(dt: number): void {
    if (this.phase === 'intermission') {
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this.phase = 'running';
        this.round = this.startRound();
      }
      return;
    }

    this.round.step(dt);
    if (this.round.status === 'resolved') this.concludeRound();
  }

  /**
   * Switch mode: abandons the current round and any series in progress, but keeps
   * the session leaderboard, which reads as a running tally across modes.
   */
  setMode(modeId: ModeId): void {
    this.modeId = modeId;
    this.restart();
  }

  /** Full reset, including the session leaderboard. */
  reset(): void {
    this.leaderboard.reset();
    this.restart();
  }

  private restart(): void {
    this.series.reset();
    this.phase = 'running';
    this.intermission = 0;
    this.round = this.startRound();
  }

  private startRound(): Round {
    const round = new Round({
      mode: createMode(this.modeId),
      flagCodes: this.flagCodes,
      // Fresh seed per round, drawn from the match seed, so the whole session
      // stays reproducible while every round differs.
      seed: this.seeds.int(1, 2_147_483_647),
    });
    this.callbacks.onRoundStart?.(round, this.series, this.leaderboard);
    return round;
  }

  private concludeRound(): void {
    const winner = this.round.winner;
    this.phase = 'intermission';
    this.intermission = WINNER_HOLD;

    if (winner === null) return;

    // Every mode feeds the session tally, series or not.
    this.leaderboard.recordWin(winner.flagCode);

    let isChampion = false;
    if (this.round.mode.usesSeries) {
      this.series.recordWin(winner.flagCode);
      isChampion = this.series.champion === winner.flagCode;
      if (isChampion) this.intermission = CHAMPION_HOLD;
    }

    this.callbacks.onRoundEnd?.(
      { winnerCode: winner.flagCode, isChampion },
      this.series,
      this.leaderboard,
    );

    // A decided series starts over, so the page keeps producing champions
    // instead of freezing on the first one.
    if (isChampion) this.series.reset();
  }
}
