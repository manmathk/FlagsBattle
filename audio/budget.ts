export interface KindLimit {
  /** Cap on *simultaneous* sounds — several genuine collisions in one frame layer. */
  maxPerFrame: number;
  /**
   * Minimum gap between frames that play this kind, which is what stops a
   * sustained stream frame after frame. 0 disables it.
   *
   * The two limits govern different things on purpose: the cap bounds how many
   * sounds one frame may play, the cooldown bounds how often frames may play any.
   * Applying the cooldown per sound instead would deny every simultaneous impact
   * after the first, since they all share a timestamp.
   */
  cooldownMs: number;
}

/**
 * Rate limiter for sound effects.
 *
 * Necessary rather than nice: 197 orbiting bodies produce hundreds of impact
 * events per second even after the world's impact threshold. Playing them all is
 * both unlistenable and a per-frame allocation spike, so each kind gets a
 * per-frame cap and a cooldown.
 */
export class SoundBudget {
  private readonly usedThisFrame = new Map<string, number>();
  private readonly lastPlayedAt = new Map<string, number>();
  private now = Number.NaN;

  constructor(private readonly limits: Readonly<Record<string, KindLimit>>) {}

  beginFrame(nowMs: number): void {
    this.now = nowMs;
    this.usedThisFrame.clear();
  }

  /** True if a sound of this kind may play now; records it if so. */
  allow(kind: string): boolean {
    if (Number.isNaN(this.now)) return false;

    const limit = this.limits[kind];
    // Unlimited kinds are the rare one-shots: lightning, a winner sting.
    if (limit === undefined) return true;

    const used = this.usedThisFrame.get(kind) ?? 0;

    if (used === 0) {
      // First request of the frame is where the cooldown is decided.
      const last = this.lastPlayedAt.get(kind);
      if (limit.cooldownMs > 0 && last !== undefined && this.now - last < limit.cooldownMs) {
        // Exhaust the kind so the rest of the frame short-circuits, without
        // touching lastPlayedAt — a denied attempt must not restart the clock.
        this.usedThisFrame.set(kind, limit.maxPerFrame);
        return false;
      }
      this.lastPlayedAt.set(kind, this.now);
    }

    if (used >= limit.maxPerFrame) return false;

    this.usedThisFrame.set(kind, used + 1);
    return true;
  }
}
