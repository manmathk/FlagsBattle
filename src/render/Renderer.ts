import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { World, WorldEvent } from '../core/World';
import { SIM, STAGE } from '../config';
import { ArenaRing } from './ArenaRing';
import { Effects } from './Effects';
import { createGlowTexture, FlagTextures } from './FlagTextures';
import type { Theme } from './themes';

/** Breathing room around the arena, as a multiple of its diameter. */
const ARENA_MARGIN = 1.08;

export interface LayoutInset {
  top: number;
  bottom: number;
}

const HALO_SCALE = 2.4;
const HALO_ALPHA = 0.4;

interface FlagView {
  flag: Sprite;
  halo: Sprite;
}

export class Renderer {
  private readonly root = new Container();
  private readonly ring = new ArenaRing();
  private readonly haloLayer = new Container();
  private readonly flagLayer = new Container();
  private readonly effects: Effects;
  private readonly views = new Map<number, FlagView>();
  private elapsed = 0;

  private constructor(
    private readonly app: Application,
    private readonly flagTextures: FlagTextures,
    private readonly glowTexture: Texture,
    private theme: Theme,
  ) {
    this.effects = new Effects(glowTexture, theme);
    this.haloLayer.blendMode = 'add';
    this.root.addChild(this.ring.view, this.haloLayer, this.flagLayer, this.effects.view);
    this.app.stage.addChild(this.root);
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement, theme: Theme): Promise<Renderer> {
    const app = new Application();
    await app.init({
      canvas,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: window,
      autoStart: false,
    });

    const flagTextures = await FlagTextures.load();
    return new Renderer(app, flagTextures, createGlowTexture(), theme);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.effects.setTheme(theme);
    for (const view of this.views.values()) view.halo.tint = theme.glow;
  }

  bindRound(world: World): void {
    this.flagLayer.removeChildren();
    this.haloLayer.removeChildren();
    this.views.clear();
    this.effects.clear();

    const size = world.bodyRadius * 2;

    for (const body of world.bodies) {
      const flag = new Sprite(this.flagTextures.get(body.flagCode));
      flag.anchor.set(0.5);
      flag.width = size * 0.75;
      flag.height = size * 0.75;

      const halo = new Sprite(this.glowTexture);
      halo.anchor.set(0.5);
      halo.width = size * HALO_SCALE * 0.75;
      halo.height = size * HALO_SCALE * 0.75;
      halo.alpha = HALO_ALPHA;
      halo.tint = this.theme.glow;

      this.haloLayer.addChild(halo);
      this.flagLayer.addChild(flag);
      this.views.set(body.id, { flag, halo });
    }
  }

  frame(world: World, alpha: number, dt: number, events: readonly WorldEvent[]): void {
    this.elapsed += dt;

    this.ring.update(world.arena, this.theme);
    this.effects.consume(events, STAGE.height);
    this.effects.update(dt);

    const pulse = 0.6 + 0.4 * Math.sin(this.elapsed * 22);

    for (const body of world.bodies) {
      const view = this.views.get(body.id);
      if (view === undefined) continue;

      if (body.state === 'eliminated') {
        view.flag.visible = false;
        view.halo.visible = false;
        continue;
      }

      const x = body.prevPos.x + (body.pos.x - body.prevPos.x) * alpha;
      const y = body.prevPos.y + (body.pos.y - body.prevPos.y) * alpha;
      view.flag.position.set(x, y);
      view.flag.rotation = body.angle;
      view.halo.position.set(x, y);

      if (body.targeted) {
        view.halo.tint = 0xffffff;
        view.halo.alpha = pulse;
      } else {
        view.halo.tint = this.theme.glow;
        view.halo.alpha = HALO_ALPHA;
      }
    }

    this.app.render();
  }

  /** Fit the arena into the HUD-safe viewport without letting the mobile circle clip. */
  resize(inset: LayoutInset = { top: 0, bottom: 0 }): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const portrait = height > width;

    // Keep a little extra horizontal breathing room on phones because the
    // arena ring and glow extend beyond the simulation radius visually.
    const horizontalPadding = portrait ? 20 : 24;
    const availableWidth = Math.max(120, width - horizontalPadding * 2);
    const availableHeight = Math.max(120, height - inset.top - inset.bottom);

    const span = SIM.arenaRadius * 2 * ARENA_MARGIN;
    const fitScale = Math.min(availableWidth, availableHeight) / span;

    this.root.scale.set(fitScale);
    this.root.position.set(width / 2, inset.top + availableHeight / 2);
  }
}
