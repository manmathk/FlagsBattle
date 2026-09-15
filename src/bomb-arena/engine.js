export class BombArena {
  constructor(flags) {
    this.flags = flags;
    this.round = 1;
    this.reset();
  }

  reset() {
    this.alive = this.flags.map((flag, index) => ({
      ...flag,
      index,
      dead: false,
      angle: Math.PI * 2 * index / this.flags.length + Math.random() * 0.05,
      radius: 0.56 + Math.random() * 0.32,
      speed: (0.16 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1),
    }));
    this.bomb = null;
    this.nextTargetAt = performance.now() + 5000;
    this.winner = null;
  }

  get aliveFlags() {
    return this.alive.filter((flag) => !flag.dead);
  }

  selectTarget(now = performance.now()) {
    if (this.aliveFlags.length <= 1) return this.resolveWinner();
    const candidates = this.aliveFlags;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    this.bomb = { code: target.code, startedAt: now };
    return target;
  }

  update(now = performance.now(), fuseSeconds = 1.65) {
    if (!this.bomb && now >= this.nextTargetAt) this.selectTarget(now);
    if (!this.bomb) return null;
    if ((now - this.bomb.startedAt) / 1000 < fuseSeconds) return null;
    const target = this.alive.find((flag) => flag.code === this.bomb.code);
    if (!target || target.dead) return null;
    target.dead = true;
    const eliminated = { ...target };
    this.bomb = null;
    this.nextTargetAt = now + 850;
    if (this.aliveFlags.length === 1) this.resolveWinner();
    return eliminated;
  }

  resolveWinner() {
    this.winner = this.aliveFlags[0] ?? null;
    return this.winner;
  }

  startNextRound() {
    this.round += 1;
    this.reset();
  }
}
