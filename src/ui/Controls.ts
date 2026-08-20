import type { ModeId } from '../modes/GameMode';
import { THEMES } from '../render/themes';

/**
 * Mode labels, used for both the dropdown and the HUD badge. One source of
 * truth: a second copy drifts, and the badge and the dropdown then disagree on
 * screen with nothing to catch it.
 */
export const MODE_LABELS: Record<ModeId, string> = {
  normal: '🔵 Normal',
  lightning: '⚡ Lightning',
  chaos: '🌪️ Chaos',
};

const MODE_IDS = Object.keys(MODE_LABELS) as ModeId[];

export interface ControlHandlers {
  onTogglePlay: () => void;
  onReset: () => void;
  onToggleSound: () => void;
  onModeChange: (id: ModeId) => void;
  onThemeChange: (id: string) => void;
}

const required = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Controls: missing #${id}`);
  return el as T;
};

export class Controls {
  private readonly play = required<HTMLButtonElement>('play');
  private readonly reset = required<HTMLButtonElement>('reset');
  private readonly sound = required<HTMLButtonElement>('sound');
  private readonly mode = required<HTMLSelectElement>('mode');
  private readonly theme = required<HTMLSelectElement>('theme');

  constructor(
    handlers: ControlHandlers,
    initial: { modeId: ModeId; themeId: string },
  ) {
    // Options are built from the same data the game uses, so a new theme or mode
    // cannot drift out of sync with the markup.
    this.mode.replaceChildren(...MODE_IDS.map((id) => new Option(MODE_LABELS[id], id)));
    this.theme.replaceChildren(...THEMES.map((t) => new Option(t.label, t.id)));
    this.mode.value = initial.modeId;
    this.theme.value = initial.themeId;

    this.play.addEventListener('click', handlers.onTogglePlay);
    this.reset.addEventListener('click', handlers.onReset);
    // This click is also what unlocks the AudioContext — browsers will not start
    // audio outside a gesture.
    this.sound.addEventListener('click', handlers.onToggleSound);
    this.mode.addEventListener('change', () => {
      handlers.onModeChange(this.mode.value as ModeId);
    });
    this.theme.addEventListener('change', () => {
      handlers.onThemeChange(this.theme.value);
    });

    window.addEventListener('keydown', (event) => {
      // Ignore keys aimed at a control: a <select> would otherwise have its
      // keyboard navigation double as arena input, and a focused <button>
      // already activates itself on Space, so handling it here too risks
      // toggling twice and appearing to do nothing.
      const target = event.target;
      if (target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) return;

      if (event.code === 'Space') {
        event.preventDefault(); // Space scrolls the page by default.
        handlers.onTogglePlay();
      } else if (event.key === 'r' || event.key === 'R') {
        handlers.onReset();
      } else if (event.key === 'm' || event.key === 'M') {
        handlers.onToggleSound();
      }
    });
  }

  setPlaying(running: boolean): void {
    this.play.textContent = running ? 'Pause' : 'Play';
    this.play.setAttribute('aria-pressed', String(!running));
  }

  setMuted(muted: boolean): void {
    this.sound.textContent = muted ? '🔇' : '🔊';
    this.sound.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.sound.setAttribute('aria-pressed', String(!muted));
  }
}
