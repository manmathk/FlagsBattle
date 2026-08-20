import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Vec2 } from '../core/Vec2';
import type { WorldEvent } from '../core/World';
import type { Theme } from './themes';

interface Particle {
  sprite: Sprite;
  vel: Vec2;
  life: number;
  maxLife: number;
}

interface Bolt {
  graphic: Graphics;
  life: number;
}

const PARTICLES_PER_ELIMINATION = 7;
const PARTICLE_LIFE = 0.55;
const PARTICLE_SPEED = 260;
const PARTICLE_DRAG = 0.94;
const BOLT_LIFE = 0.28;
/**
 * Additive blending means concurrent particles sum toward white. When the gap
 * sweeps the bottom, dozens of flags drain within a few frames, so this ceiling
 * is about brightness as much as cost.
 */
const MAX_PARTICLES = 200;

/**
 * Transient visuals: elimination bursts and lightning bolts.
 *
 * Driven entirely by the plain-data events the simulation emits, which is what
 * keeps the modes free of any rendering concern.
 */
export class Effects {
  readonly view = new Container();
  private readonly particles: Particle[] = [];
  private readonly pool: Sprite[] = [];
  private readonly bolts: Bolt[] = [];
  private theme: Theme;

  constructor(
    private readonly glowTexture: Texture,
    theme: Theme,
  ) {
    this.theme = theme;
    this.view.blendMode = 'add';
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  consume(events: readonly WorldEvent[], stageHeight: number): void {
    for (const event of events) {
      if (event.type === 'eliminated') this.burst(event.at);
      else if (event.type === 'lightning') this.bolt(event.at, stageHeight);
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.pool.push(p.sprite);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.x *= PARTICLE_DRAG;
      p.vel.y *= PARTICLE_DRAG;
      p.sprite.x += p.vel.x * dt;
      p.sprite.y += p.vel.y * dt;
      const t = p.life / p.maxLife;
      p.sprite.alpha = t * 0.7;
      p.sprite.scale.set(0.25 + (1 - t) * 0.5);
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i]!;
      bolt.life -= dt;
      if (bolt.life <= 0) {
        bolt.graphic.destroy();
        this.bolts.splice(i, 1);
        continue;
      }
      bolt.graphic.alpha = bolt.life / BOLT_LIFE;
    }
  }

  /** Drop everything — used when a round is reset. */
  clear(): void {
    for (const p of this.particles) {
      p.sprite.visible = false;
      this.pool.push(p.sprite);
    }
    this.particles.length = 0;
    for (const bolt of this.bolts) bolt.graphic.destroy();
    this.bolts.length = 0;
  }

  private burst(at: Vec2): void {
    for (let i = 0; i < PARTICLES_PER_ELIMINATION; i++) {
      // Hard cap: a sudden-death cascade can eliminate dozens at once, and an
      // unbounded burst would spike the frame it lands on.
      if (this.particles.length >= MAX_PARTICLES) return;

      const sprite = this.takeSprite();
      sprite.tint = this.theme.particle;
      sprite.position.set(at.x, at.y);
      sprite.alpha = 1;

      const angle = (i / PARTICLES_PER_ELIMINATION) * Math.PI * 2 + Math.random();
      const speed = PARTICLE_SPEED * (0.4 + Math.random() * 0.6);
      this.particles.push({
        sprite,
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
      });
    }
  }

  private bolt(at: Vec2, stageHeight: number): void {
    const graphic = new Graphics();
    // Jagged descent from above the arena down to the struck flag.
    let x = at.x + (Math.random() - 0.5) * 120;
    let y = -stageHeight / 2;
    graphic.moveTo(x, y);
    const segments = 9;
    for (let i = 1; i <= segments; i++) {
      const progress = i / segments;
      x = at.x * progress + x * (1 - progress) + (Math.random() - 0.5) * 70;
      y = -stageHeight / 2 + (at.y + stageHeight / 2) * progress;
      graphic.lineTo(x, y);
    }
    graphic.stroke({ width: 4, color: this.theme.glow, alpha: 0.95, cap: 'round' });
    graphic.blendMode = 'add';

    this.view.addChild(graphic);
    this.bolts.push({ graphic, life: BOLT_LIFE });
  }

  private takeSprite(): Sprite {
    const reused = this.pool.pop();
    if (reused !== undefined) {
      reused.visible = true;
      return reused;
    }
    const sprite = new Sprite(this.glowTexture);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    this.view.addChild(sprite);
    return sprite;
  }
}
