/**
 * Arena themes.
 *
 * Each theme is pure data: background stops, ring, glow, particle and accent
 * colours. Light themes may also opt into a high-contrast DOM palette.
 */
export interface Theme {
  readonly id: string;
  readonly label: string;
  readonly bg: readonly [number, number];
  readonly ring: number;
  readonly glow: number;
  readonly particle: number;
  readonly accent: number;
  readonly light?: boolean;
}

export const THEMES: readonly Theme[] = [
  { id: 'space', label: '🌌 Space', bg: [0x05010f, 0x140a2e], ring: 0x6f4ef2, glow: 0xa78bfa, particle: 0xc4b5fd, accent: 0xa78bfa },
  { id: 'cyber', label: '🔷 Cyber', bg: [0x01121a, 0x052b3a], ring: 0x00e5ff, glow: 0x22d3ee, particle: 0x67e8f9, accent: 0x22d3ee },
  { id: 'gold', label: '✨ Gold', bg: [0x1a1204, 0x3d2c07], ring: 0xffc53d, glow: 0xffd97a, particle: 0xffe9a8, accent: 0xffc53d },
  { id: 'ice', label: '❄️ Ice', bg: [0x06131c, 0x0d2b3d], ring: 0x7dd3fc, glow: 0xbae6fd, particle: 0xe0f2fe, accent: 0x7dd3fc },
  { id: 'midnight', label: '🌙 Midnight', bg: [0x02040f, 0x0a1128], ring: 0x3b82f6, glow: 0x60a5fa, particle: 0x93c5fd, accent: 0x60a5fa },
  { id: 'aurora', label: '🌌 Aurora', bg: [0x030d12, 0x06263a], ring: 0x34d399, glow: 0x6ee7b7, particle: 0xa7f3d0, accent: 0x34d399 },
  { id: 'abyss', label: '🕳️ Abyss', bg: [0x000308, 0x04121f], ring: 0x1e6091, glow: 0x2a7fb8, particle: 0x4fa3d1, accent: 0x2a7fb8 },
  { id: 'neon', label: '💜 Neon', bg: [0x0f0018, 0x2a0640], ring: 0xff2fd0, glow: 0xff7ae0, particle: 0xffb3ef, accent: 0xff2fd0 },
  { id: 'nebula', label: '🌠 Nebula', bg: [0x10041c, 0x35104a], ring: 0xc026d3, glow: 0xe879f9, particle: 0xf5d0fe, accent: 0xe879f9 },
  { id: 'eclipse', label: '🌑 Eclipse', bg: [0x0a0603, 0x24140a], ring: 0xf97316, glow: 0xfb923c, particle: 0xfed7aa, accent: 0xf97316 },
  { id: 'obsidian', label: '🖤 Obsidian', bg: [0x030304, 0x131316], ring: 0x94a3b8, glow: 0xcbd5e1, particle: 0xe2e8f0, accent: 0xcbd5e1 },
  { id: 'shadow', label: '🌚 Shadow', bg: [0x060608, 0x16161c], ring: 0x6b7280, glow: 0x9ca3af, particle: 0xd1d5db, accent: 0x9ca3af },
  { id: 'lava', label: '🌋 Lava', bg: [0x1a0500, 0x4a0f00], ring: 0xff6b1a, glow: 0xffb347, particle: 0xffd08a, accent: 0xff6b1a },
  { id: 'deepsea', label: '🌊 DeepSea', bg: [0x001014, 0x01303a], ring: 0x06b6d4, glow: 0x22d3ee, particle: 0xa5f3fc, accent: 0x06b6d4 },
  { id: 'white', label: '☀️ White', bg: [0xffffff, 0xf1f5f9], ring: 0x334155, glow: 0x64748b, particle: 0x94a3b8, accent: 0x2563eb, light: true },
];

export const DEFAULT_THEME_ID = 'space';

export const themeById = (id: string): Theme =>
  THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;

export const toCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
