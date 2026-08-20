import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import atlas from './atlas.json';
import { FLAGS } from './flags';

describe('FLAGS', () => {
  it('fields a full arena', () => {
    expect(FLAGS.length).toBeGreaterThan(150);
  });

  it('has no duplicate codes', () => {
    const codes = FLAGS.map((f) => f.code);
    expect(codes.length).toBe(new Set(codes).size);
  });

  it('uses lowercase two-letter codes throughout', () => {
    // CI is Linux and case-sensitive, macOS is not: a stray uppercase code here
    // resolves locally and 404s only once deployed.
    for (const flag of FLAGS) expect(flag.code).toMatch(/^[a-z]{2}$/);
  });

  it('names every country', () => {
    for (const flag of FLAGS) {
      expect(flag.name.length).toBeGreaterThan(1);
      expect(flag.name).not.toBe(flag.code.toUpperCase());
    }
  });

  it('has an atlas frame for every flag', () => {
    // The atlas is committed, so this guards the generated asset against the
    // dataset drifting away from it.
    const frames = Object.keys(atlas.frames);
    for (const flag of FLAGS) expect(frames).toContain(flag.code);
  });

  it('has no orphaned atlas frames', () => {
    const codes = new Set(FLAGS.map((f) => f.code));
    for (const frame of Object.keys(atlas.frames)) expect(codes.has(frame)).toBe(true);
  });

  it('ships the atlas image the frames refer to', () => {
    expect(existsSync('public/atlas/flags.png')).toBe(true);
  });
});
