import { Container, Graphics } from 'pixi.js';
import type { Arena } from '../core/Arena';
import type { Theme } from './themes';

const RING_WIDTH = 7;
const GLOW_WIDTH = 22;

/**
 * The arena boundary: a crisp stroked arc plus one wider, dimmer copy behind it
 * for bloom.
 *
 * The glow is a second stroke rather than a real blur filter. A genuine bloom
 * pass here would be a per-frame multi-pass blur over the whole arena, and the
 * visual difference does not pay for that.
 */
export class ArenaRing {
  readonly view = new Container();
  private readonly glow = new Graphics();
  private readonly ring = new Graphics();

  constructor() {
    this.glow.alpha = 0.35;
    this.glow.blendMode = 'add';
    this.view.addChild(this.glow, this.ring);
  }

  update(arena: Arena, theme: Theme): void {
    this.glow.clear();
    this.ring.clear();

    const { center, radius, gap } = arena;

    if (gap === null) {
      this.glow.circle(center.x, center.y, radius);
      this.ring.circle(center.x, center.y, radius);
    } else {
      // Draw the ring as the arc that is *not* the gap.
      const from = gap.centerAngle + gap.width / 2;
      const to = gap.centerAngle - gap.width / 2 + Math.PI * 2;
      this.glow.arc(center.x, center.y, radius, from, to);
      this.ring.arc(center.x, center.y, radius, from, to);
    }

    this.glow.stroke({ width: GLOW_WIDTH, color: theme.glow, alpha: 0.5, cap: 'round' });
    this.ring.stroke({ width: RING_WIDTH, color: theme.ring, alpha: 1, cap: 'round' });
  }
}
