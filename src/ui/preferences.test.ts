import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './preferences';

const fakeStorage = (initial: string | null) => {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    read: () => value,
  };
};

describe('loadPreferences', () => {
  it('returns defaults when storage is unavailable', () => {
    expect(loadPreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadPreferences(fakeStorage(null))).toEqual(DEFAULT_PREFERENCES);
  });

  it('returns defaults when storage access throws', () => {
    // Safari in private browsing throws on access rather than returning null.
    const hostile = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadPreferences(hostile)).toEqual(DEFAULT_PREFERENCES);
  });

  it('returns defaults for malformed JSON', () => {
    expect(loadPreferences(fakeStorage('{not json'))).toEqual(DEFAULT_PREFERENCES);
  });

  it('returns defaults for a JSON value that is not an object', () => {
    expect(loadPreferences(fakeStorage('42'))).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences(fakeStorage('null'))).toEqual(DEFAULT_PREFERENCES);
  });

  it('reads back valid preferences', () => {
    const stored = JSON.stringify({ modeId: 'chaos', themeId: 'lava', muted: false });
    expect(loadPreferences(fakeStorage(stored))).toEqual({
      modeId: 'chaos',
      themeId: 'lava',
      muted: false,
    });
  });

  it('defaults to muted when the flag is missing or not a boolean', () => {
    expect(loadPreferences(fakeStorage(JSON.stringify({ modeId: 'chaos' }))).muted).toBe(true);
    expect(loadPreferences(fakeStorage(JSON.stringify({ muted: 'yes' }))).muted).toBe(true);
  });

  it('remembers an unmuted preference', () => {
    expect(loadPreferences(fakeStorage(JSON.stringify({ muted: false }))).muted).toBe(false);
  });

  it('rejects an unknown mode but keeps a valid theme', () => {
    const stored = JSON.stringify({ modeId: 'sandbox', themeId: 'lava' });
    expect(loadPreferences(fakeStorage(stored))).toEqual({
      modeId: DEFAULT_PREFERENCES.modeId,
      themeId: 'lava',
      muted: DEFAULT_PREFERENCES.muted,
    });
  });

  it('rejects an unknown theme but keeps a valid mode', () => {
    const stored = JSON.stringify({ modeId: 'chaos', themeId: 'chartreuse' });
    expect(loadPreferences(fakeStorage(stored))).toEqual({
      modeId: 'chaos',
      themeId: DEFAULT_PREFERENCES.themeId,
      muted: DEFAULT_PREFERENCES.muted,
    });
  });
});

describe('savePreferences', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage(null);
    savePreferences(storage, { modeId: 'lightning', themeId: 'ice', muted: false });
    expect(loadPreferences(storage)).toEqual({
      modeId: 'lightning',
      themeId: 'ice',
      muted: false,
    });
  });

  it('does nothing when storage is unavailable', () => {
    expect(() => savePreferences(undefined, DEFAULT_PREFERENCES)).not.toThrow();
  });

  it('swallows a storage write failure', () => {
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => savePreferences(full, DEFAULT_PREFERENCES)).not.toThrow();
  });
});
