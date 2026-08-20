/**
 * Rasterises the circular flag SVGs into a single texture atlas.
 *
 * Run by hand (`npm run build:atlas`) and the OUTPUT IS COMMITTED. That is
 * deliberate: this needs sharp, and native modules are the most common cause of
 * CI deploy failures. Committing the atlas means CI runs a plain `vite build`
 * with no image toolchain at all.
 *
 * One atlas rather than 197 separate images also means all flag sprites batch
 * into essentially one draw call.
 *
 * REQUIRES NODE >= 20.9 (a sharp constraint). The rest of the project runs on
 * Node 18; only this tool needs the newer runtime, and only when the flag list
 * changes. With nvm:  nvm use 22 && npm run build:atlas
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { FLAGS } from '../src/data/flags';

/** Rendered size of one flag in the atlas. Flags draw at ~48px, so this has headroom. */
const CELL = 64;

/**
 * Transparent gutter between frames.
 *
 * The HUD reuses this atlas as a CSS sprite sheet at fractional scales, and
 * without a gutter subpixel rounding shows a sliver of the neighbouring flag
 * along the edge. Bleeding into transparency is invisible; bleeding into Belgium
 * is not.
 */
const GUTTER = 2;

/** Rasterise at high density first: scaling a 72dpi SVG up to 64px is mushy. */
const RASTER_DENSITY = 300;

const SVG_DIR = 'node_modules/circle-flags/flags';
const OUT_PNG = 'public/atlas/flags.png';
/** JSON is bundled rather than served, so the page needs one request, not two. */
const OUT_JSON = 'src/data/atlas.json';

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const main = async (): Promise<void> => {
  const columns = Math.ceil(Math.sqrt(FLAGS.length));
  const rows = Math.ceil(FLAGS.length / columns);
  const stride = CELL + GUTTER;
  const width = columns * stride;
  const height = rows * stride;

  const frames: Record<string, Frame> = {};
  const composites: OverlayOptions[] = [];

  for (const [index, flag] of FLAGS.entries()) {
    const svg = readFileSync(join(SVG_DIR, `${flag.code}.svg`));
    const png = await sharp(svg, { density: RASTER_DENSITY })
      .resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const left = (index % columns) * stride;
    const top = Math.floor(index / columns) * stride;
    composites.push({ input: png, left, top });
    frames[flag.code] = { x: left, y: top, w: CELL, h: CELL };
  }

  mkdirSync(dirname(OUT_PNG), { recursive: true });
  await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(OUT_PNG);

  writeFileSync(
    OUT_JSON,
    `${JSON.stringify({ size: { w: width, h: height }, cell: CELL, frames }, null, 0)}\n`,
  );

  console.log(`atlas: ${FLAGS.length} flags, ${width}x${height}, ${columns}x${rows} grid`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
