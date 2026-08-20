import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { World, WorldEvent } from '../core/World';
import { SIM, STAGE } from '../config';
import { ArenaRing } from './ArenaRing';
import { Effects } from './Effects';
import { createGlowTexture, FlagTextures } from './FlagTextures';
import type { Theme } from './themes';

/** Breathing room around the arena, as a multiple of its diameter. */
const ARENA_MARGIN = 1.08;

/** Vertical band the arena is laid out in, when no HUD insets are supplied. */
export interface LayoutInset {
  top: number;
  bottom: number;
}

/** Halo size relative to the flag itself. */
const HALO_SCALE = 2.4;
const HALO_ALPHA = 0.4;

interface FlagView {
  flag: Sprite;
  halo: Sprite;
}

/**
 * Draws the simulation. Read-only with respect to world state: it never mutates
 * a body, so the simulation stays authoritative and independently testable.
 *
 * The themed background is a CSS gradient on the page rather than a Pixi layer —
 * the canvas is transparent over it. That is crisper than a gradient mesh, makes
 * theme switching a CSS variable change, and saves a full-screen draw per frame.
 */
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
      // Transparent: the themed gradient lives in CSS behind the canvas.
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: window,
      // The simulation drives its own fixed-step loop.
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

  /** Rebuild sprites for a new round. */
  bindRound(world: World): void {
    this.flagLayer.removeChildren();
    this.haloLayer.removeChildren();
    this.views.clear();
    this.effects.clear();

    const size = world.bodyRadius * 2;

    for (const body of world.bodies) {
      const flag = new Sprite(this.flagTextures.get(body.flagCode));
      flag.anchor.set(0.5);
      flag.width = size;
      flag.height = size;

      const halo = new Sprite(this.glowTexture);
      halo.anchor.set(0.5);
      halo.width = size * HALO_SCALE;
      halo.height = size * HALO_SCALE;
      halo.alpha = HALO_ALPHA;
      halo.tint = this.theme.glow;

      this.haloLayer.addChild(halo);
      this.flagLayer.addChild(flag);
      this.views.set(body.id, { flag, halo });
    }
  }

  /**
   * @param alpha fraction of a physics step still pending, for interpolation.
   * @param dt real seconds since the last frame, for effect lifetimes.
   * @param events this frame's world events. Passed in rather than drained here,
   *   because the HUD needs the same events and a queue can only be drained once.
   */
  frame(world: World, alpha: number, dt: number, events: readonly WorldEvent[]): void {
    this.elapsed += dt;

    this.ring.update(world.arena, this.theme);
    this.effects.consume(events, STAGE.height);
    this.effects.update(dt);

    // Telegraphed flags pulse; shared phase so a struck batch flashes together.
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
      // Contact friction spins the bodies; showing it is what makes them read as
      // balls rolling rather than discs sliding. The halo is radial, so it does
      // not need rotating.
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

  /**
   * Fit the arena into the space the HUD leaves it.
   *
   * Scaling is driven by the arena's own diameter rather than by letterboxing the
   * 16:9 logical stage. On a portrait phone the stage's aspect ratio is the
   * binding constraint, which shrank the arena to roughly a fifth of the screen
   * while most of the display sat empty.
   */
  resize(inset: LayoutInset = { top: 0, bottom: 0 }): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const availableWidth = Math.max(120, width - 24);
    const availableHeight = Math.max(120, height - inset.top - inset.bottom);

    const span = SIM.arenaRadius * 2 * ARENA_MARGIN;
    this.root.scale.set(Math.min(availableWidth, availableHeight) / span);
    // Simulation coordinates are centred on the origin; centre it in the band the
    // HUD leaves rather than in the window, so it is not pushed under the strip.
    this.root.position.set(width / 2, inset.top + availableHeight / 2);
  }
}
