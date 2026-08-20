import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID, THEMES, themeById, toCss } from './themes';

describe('THEMES', () => {
  it('ships all fourteen arena themes', () => {
    expect(THEMES).toHaveLength(14);
  });

  it('has unique ids', () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('defines every colour slot for every theme', () => {
    for (const theme of THEMES) {
      expect(theme.bg).toHaveLength(2);
      for (const color of [...theme.bg, theme.ring, theme.glow, theme.particle, theme.accent]) {
        expect(color).toBeGreaterThanOrEqual(0);
        expect(color).toBeLessThanOrEqual(0xffffff);
      }
      expect(theme.label.length).toBeGreaterThan(0);
    }
  });

  it('has a valid default', () => {
    expect(THEMES.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true);
  });
});

describe('themeById', () => {
  it('finds a theme by id', () => {
    expect(themeById('lava').id).toBe('lava');
  });

  it('falls back to the default rather than throwing on an unknown id', () => {
    // Theme ids come from localStorage, which can hold anything.
    expect(themeById('not-a-theme').id).toBe(DEFAULT_THEME_ID);
  });
});

describe('toCss', () => {
  it('pads short hex values to six digits', () => {
    expect(toCss(0x000308)).toBe('#000308');
    expect(toCss(0xffc53d)).toBe('#ffc53d');
    expect(toCss(0x0)).toBe('#000000');
  });
});
