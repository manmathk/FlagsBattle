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
  onVoiceEnable: () => void;
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
  private readonly voice = required<HTMLButtonElement>('voice');
  private readonly mode = required<HTMLSelectElement>('mode');
  private readonly theme = required<HTMLSelectElement>('theme');

  constructor(
    handlers: ControlHandlers,
    initial: { modeId: ModeId; themeId: string },
  ) {
    this.mode.replaceChildren(...MODE_IDS.map((id) => new Option(MODE_LABELS[id], id)));
    this.theme.replaceChildren(...THEMES.map((t) => new Option(t.label, t.id)));
    this.mode.value = initial.modeId;
    this.theme.value = initial.themeId;

    this.play.addEventListener('click', handlers.onTogglePlay);
    this.reset.addEventListener('click', handlers.onReset);
    this.sound.addEventListener('click', handlers.onToggleSound);
    // Keep voice activation directly on the button click so iOS Safari sees
    // the speech request as part of the user's activation.
    this.voice.addEventListener('click', handlers.onVoiceEnable);
    this.mode.addEventListener('change', () => {
      handlers.onModeChange(this.mode.value as ModeId);
    });
    this.theme.addEventListener('change', () => {
      handlers.onThemeChange(this.theme.value);
    });

    window.addEventListener('keydown', (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) return;

      if (event.code === 'Space') {
        event.preventDefault();
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
