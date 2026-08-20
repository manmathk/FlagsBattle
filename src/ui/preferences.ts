import type { ModeId } from '../modes/GameMode';
import { DEFAULT_THEME_ID, THEMES } from '../render/themes';

const STORAGE_KEY = 'flagsbattle.preferences';
const MODE_IDS: readonly ModeId[] = ['normal', 'lightning', 'chaos'];
const DEFAULT_MODE: ModeId = 'normal';

export interface Preferences {
  modeId: ModeId;
  themeId: string;
  muted: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  modeId: DEFAULT_MODE,
  themeId: DEFAULT_THEME_ID,
  // Muted by default: browsers block audio outside a user gesture anyway, and a
  // page that starts making noise on load is hostile.
  muted: true,
};

const isModeId = (value: unknown): value is ModeId =>
  typeof value === 'string' && (MODE_IDS as readonly string[]).includes(value);

const isThemeId = (value: unknown): value is string =>
  typeof value === 'string' && THEMES.some((t) => t.id === value);

/**
 * Read the saved mode and theme.
 *
 * Every failure path falls back to defaults rather than throwing: storage can be
 * unavailable entirely (Safari private browsing throws on access), and its
 * contents are user-editable, so nothing in here can be trusted to be well formed.
 */
export const loadPreferences = (storage: Pick<Storage, 'getItem'> | undefined): Preferences => {
  if (storage === undefined) return { ...DEFAULT_PREFERENCES };

  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
  if (raw === null) return { ...DEFAULT_PREFERENCES };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFERENCES };

  const candidate = parsed as Record<string, unknown>;
  return {
    modeId: isModeId(candidate.modeId) ? candidate.modeId : DEFAULT_PREFERENCES.modeId,
    themeId: isThemeId(candidate.themeId) ? candidate.themeId : DEFAULT_PREFERENCES.themeId,
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : DEFAULT_PREFERENCES.muted,
  };
};

export const savePreferences = (
  storage: Pick<Storage, 'setItem'> | undefined,
  preferences: Preferences,
): void => {
  if (storage === undefined) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage full or blocked: preferences are a convenience, never load-bearing.
  }
};
