import { Assets, Rectangle, Texture } from 'pixi.js';
import atlas from '../data/atlas.json';

/**
 * Flag textures cut from one committed atlas image.
 *
 * All 197 sprites therefore share a single GPU texture, which is what lets them
 * batch into essentially one draw call. Loading 197 individual SVGs instead would
 * mean 197 requests and 197 draw calls.
 */
export class FlagTextures {
  private constructor(private readonly textures: Map<string, Texture>) {}

  static async load(): Promise<FlagTextures> {
    // BASE_URL keeps this correct under a GitHub Pages project path.
    const sheet = await Assets.load<Texture>(`${import.meta.env.BASE_URL}atlas/flags.png`);
    const textures = new Map<string, Texture>();

    for (const [code, frame] of Object.entries(atlas.frames)) {
      textures.set(
        code,
        new Texture({
          source: sheet.source,
          frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
        }),
      );
    }
    return new FlagTextures(textures);
  }

  get(code: string): Texture {
    const texture = this.textures.get(code);
    if (texture === undefined) throw new Error(`FlagTextures: no frame for "${code}"`);
    return texture;
  }
}

/**
 * Soft radial dot, drawn once into a canvas and reused for every glow and
 * particle. Cheaper than a blur filter and it composites additively for free.
 */
export const createGlowTexture = (size = 128): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('createGlowTexture: no 2d context');

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return Texture.from(canvas);
};
