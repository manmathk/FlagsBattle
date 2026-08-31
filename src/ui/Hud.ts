import atlas from '../data/atlas.json';
import { FLAGS } from '../data/flags';
import type { ChaosEventKind } from '../core/World';
import type { Standing } from '../game/Leaderboard';
import { toCss, type Theme } from '../render/themes';

const NAMES = new Map(FLAGS.map((f) => [f.code, f.name]));

const EVENT_LABELS: Record<ChaosEventKind, string> = {
  vortex: '🌀 Vortex',
  wind: '💨 Wind',
  speedBurst: '⚡ Speed burst',
  chaosSpin: '🌪️ Chaos spin',
};

const flagBackground = (code: string, size: number): string => {
  const frame = (atlas.frames as Record<string, { x: number; y: number }>)[code];
  if (frame === undefined) return '';
  const k = size / atlas.cell;
  return [
    `background-image:url(${import.meta.env.BASE_URL}atlas/flags.png)`,
    `background-size:${atlas.size.w * k}px ${atlas.size.h * k}px`,
    `background-position:-${frame.x * k}px -${frame.y * k}px`,
  ].join(';');
};

const nameOf = (code: string): string => NAMES.get(code) ?? code.toUpperCase();

const required = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Hud: missing #${id}`);
  return el as T;
};

export class Hud {
  private readonly modeBadge = required('mode-badge');
  private readonly aliveBadge = required('alive-badge');
  private readonly lastRound = required('last-round');
  private readonly lastWinnerChip = required('last-winner-chip');
  private readonly lastWinnerName = required('last-winner-name');
  private readonly topTitle = required('top-title');
  private readonly topList = required('top-list');
  private readonly seriesBlock = required('series-block');
  private readonly seriesList = required('series-list');
  private readonly eventLabel = required('event-label');
  private readonly banner = required('banner');

  private eventTimer: number | undefined;
  private bannerTimer: number | undefined;

  applyTheme(theme: Theme): void {
    const root = document.documentElement.style;
    root.setProperty('--bg-outer', toCss(theme.bg[0]));
    root.setProperty('--bg-inner', toCss(theme.bg[1]));
    root.setProperty('--accent', toCss(theme.accent));
    root.setProperty('--glow', toCss(theme.glow));

    if (theme.light) {
      root.setProperty('--text', '#0f172a');
      root.setProperty('--muted', '#64748b');
      root.setProperty('--panel', 'rgb(255 255 255 / 84%)');
      root.setProperty('--border', 'rgb(15 23 42 / 12%)');
      root.setProperty('--control-bg', 'rgb(15 23 42 / 6%)');
      root.setProperty('--control-hover', 'rgb(15 23 42 / 11%)');
      root.setProperty('--option-bg', '#ffffff');
    } else {
      root.setProperty('--text', '#f8fafc');
      root.setProperty('--muted', '#94a3b8');
      root.setProperty('--panel', 'rgb(8 8 16 / 62%)');
      root.setProperty('--border', 'rgb(255 255 255 / 10%)');
      root.setProperty('--control-bg', 'rgb(255 255 255 / 7%)');
      root.setProperty('--control-hover', 'rgb(255 255 255 / 14%)');
      root.setProperty('--option-bg', '#0b0b12');
    }
  }

  setMode(label: string): void {
    this.modeBadge.textContent = label;
  }

  setAlive(alive: number, total: number): void {
    this.aliveBadge.textContent = `${alive} / ${total} alive`;
  }

  setLastWinner(flagCode: string | null): void {
    if (flagCode === null) {
      this.lastRound.hidden = true;
      return;
    }
    this.lastWinnerChip.setAttribute('style', flagBackground(flagCode, 30));
    this.lastWinnerName.textContent = nameOf(flagCode);
    this.lastRound.hidden = false;
  }

  setTopFive(standings: readonly Standing[], roundsPlayed: number): void {
    this.topTitle.textContent = roundsPlayed === 0 ? '🏆 Top 5 Winners' : `🏆 Top 5 Winners · ${roundsPlayed} ${roundsPlayed === 1 ? 'round' : 'rounds'}`;

    if (standings.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'strip-empty';
      empty.textContent = 'Waiting for the first champion…';
      this.topList.replaceChildren(empty);
      return;
    }

    this.topList.replaceChildren(
      ...standings.slice(0, 5).map((standing, index) => {
        const item = document.createElement('li');
        item.className = `winner-item winner-rank-${index + 1}`;
        item.title = `${index + 1}. ${nameOf(standing.flagCode)} — ${standing.wins} ${standing.wins === 1 ? 'win' : 'wins'}`;

        const rank = document.createElement('span');
        rank.className = 'winner-rank';
        rank.textContent = `${index + 1}`;

        const chip = document.createElement('span');
        chip.className = 'winner-flag';
        chip.setAttribute('style', flagBackground(standing.flagCode, 30));

        const info = document.createElement('span');
        info.className = 'winner-info';

        const name = document.createElement('span');
        name.className = 'winner-name';
        name.textContent = nameOf(standing.flagCode);

        const wins = document.createElement('span');
        wins.className = 'winner-wins';
        wins.textContent = `${standing.wins} ${standing.wins === 1 ? 'win' : 'wins'}`;

        info.append(name, wins);
        item.append(rank, chip, info);
        return item;
      }),
    );
  }

  setSeries(standings: readonly Standing[], target: number): void {
    if (standings.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'strip-empty';
      empty.textContent = `first to ${target}`;
      this.seriesList.replaceChildren(empty);
      return;
    }

    this.seriesList.replaceChildren(
      ...standings.slice(0, 3).map((standing) => {
        const item = document.createElement('li');
        item.className = 'strip-item';
        item.title = `${nameOf(standing.flagCode)} — ${standing.wins} of ${target}`;

        const chip = document.createElement('span');
        chip.className = 'flag-chip';
        chip.setAttribute('style', flagBackground(standing.flagCode, 22));

        const pips = document.createElement('span');
        pips.className = 'pips';
        for (let i = 0; i < target; i++) {
          const pip = document.createElement('span');
          pip.className = i < standing.wins ? 'pip won' : 'pip';
          pips.appendChild(pip);
        }

        item.append(chip, pips);
        return item;
      }),
    );
  }

  showSeries(visible: boolean): void {
    this.seriesBlock.hidden = !visible;
  }

  showChaosEvent(kind: ChaosEventKind): void {
    this.eventLabel.textContent = EVENT_LABELS[kind];
    this.eventLabel.hidden = false;
    window.clearTimeout(this.eventTimer);
    this.eventTimer = window.setTimeout(() => {
      this.eventLabel.hidden = true;
    }, 2200);
  }

  showWinner(flagCode: string, kicker: string, isChampion: boolean, holdMs: number): void {
    const kickerEl = document.createElement('div');
    kickerEl.className = 'banner-kicker';
    kickerEl.textContent = kicker;

    const flagEl = document.createElement('div');
    flagEl.className = 'banner-flag';
    flagEl.setAttribute('style', flagBackground(flagCode, 112));

    const nameEl = document.createElement('div');
    nameEl.className = 'banner-name';
    nameEl.textContent = nameOf(flagCode);

    this.banner.className = isChampion ? 'banner champion' : 'banner';
    this.banner.replaceChildren(kickerEl, flagEl, nameEl);
    this.banner.hidden = false;

    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.banner.hidden = true;
    }, holdMs);
  }

  hideBanner(): void {
    window.clearTimeout(this.bannerTimer);
    this.banner.hidden = true;
  }
}
