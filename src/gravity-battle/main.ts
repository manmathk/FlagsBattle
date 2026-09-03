import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const ctx = canvas.getContext('2d')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const countdown = document.querySelector<HTMLDivElement>('#countdown')!;
const score = document.querySelector<HTMLDivElement>('#score')!;

const redSelect = document.querySelector<HTMLSelectElement>('#red-select')!;
const blueSelect = document.querySelector<HTMLSelectElement>('#blue-select')!;
const redFlag = document.querySelector<HTMLSpanElement>('#red-flag')!;
const blueFlag = document.querySelector<HTMLSpanElement>('#blue-flag')!;
const redName = document.querySelector<HTMLElement>('#red-name')!;
const blueName = document.querySelector<HTMLElement>('#blue-name')!;

const COUNTRIES = [
  ['IN', '🇮🇳', 'INDIA'], ['US', '🇺🇸', 'USA'], ['BR', '🇧🇷', 'BRAZIL'],
  ['JP', '🇯🇵', 'JAPAN'], ['GB', '🇬🇧', 'UK'], ['DE', '🇩🇪', 'GERMANY'],
  ['FR', '🇫🇷', 'FRANCE'], ['IT', '🇮🇹', 'ITALY'], ['CA', '🇨🇦', 'CANADA'],
  ['AU', '🇦🇺', 'AUSTRALIA'], ['MX', '🇲🇽', 'MEXICO'], ['AR', '🇦🇷', 'ARGENTINA'],
] as const;

for (const [code, , name] of COUNTRIES) {
  redSelect.add(new Option(name, code));
  blueSelect.add(new Option(name, code));
}
redSelect.value = 'IN';
blueSelect.value = 'US';

const TAU = Math.PI * 2;
const GRAVITY = 185; // px/s²; the supplied pygame 0.1/frame scaled to a stable fixed timestep.
const BOUNCE = 0.94;
const BALL_RADIUS = 24;
const MAX_SPEED = 760;
const ROUND_SECONDS = 30;
const FIXED_DT = 1 / 120;

let width = 400;
let height = 700;
let dpr = 1;
let centerX = 200;
let centerY = 360;
let arenaRadius = 160;
let running = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let redWins = 0;
let blueWins = 0;
let winner: 'red' | 'blue' | null = null;

class CountryBall {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  spin = 0;
  trail: { x: number; y: number }[] = [];

  constructor(public readonly team: 'red' | 'blue') {}

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() * 2 - 1) * 220;
    this.vy = (Math.random() * 2 - 1) * 220;
    this.angle = Math.random() * TAU;
    this.spin = (Math.random() * 2 - 1) * 2;
    this.trail = [];
  }

  update(dt: number): void {
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spin * dt;
    this.spin *= Math.pow(0.72, dt);

    const dx = this.x - centerX;
    const dy = this.y - centerY;
    const distance = Math.hypot(dx, dy) || 0.0001;
    const maxDistance = arenaRadius - BALL_RADIUS;

    if (distance > maxDistance) {
      const nx = dx / distance;
      const ny = dy / distance;
      const dot = this.vx * nx + this.vy * ny;
      this.x = centerX + nx * maxDistance;
      this.y = centerY + ny * maxDistance;
      if (dot > 0) {
        this.vx -= (1 + BOUNCE) * dot * nx;
        this.vy -= (1 + BOUNCE) * dot * ny;
        this.spin += (this.vx * ny - this.vy * nx) * 0.003;
      }
    }

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > MAX_SPEED) {
      const k = MAX_SPEED / speed;
      this.vx *= k;
      this.vy *= k;
    }

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 9) this.trail.shift();
  }
}

const red = new CountryBall('red');
const blue = new CountryBall('blue');

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  centerX = width / 2;
  centerY = height * 0.49;
  arenaRadius = Math.min(width * 0.43, height * 0.36, 215);
  resetBalls();
}

function resetBalls(): void {
  const spread = Math.max(70, arenaRadius * 0.55);
  red.reset(centerX - spread, centerY - 4);
  blue.reset(centerX + spread, centerY - 4);
}

function collideBalls(): void {
  let dx = blue.x - red.x;
  let dy = blue.y - red.y;
  let dist = Math.hypot(dx, dy);
  if (dist === 0) { dx = 1; dy = 0; dist = 1; }
  const minDist = BALL_RADIUS * 2;
  if (dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  red.x -= nx * overlap * 0.5;
  red.y -= ny * overlap * 0.5;
  blue.x += nx * overlap * 0.5;
  blue.y += ny * overlap * 0.5;

  const rel = (blue.vx - red.vx) * nx + (blue.vy - red.vy) * ny;
  if (rel >= 0) return;
  const impulse = -(1 + 0.98) * rel / 2;
  red.vx -= impulse * nx;
  red.vy -= impulse * ny;
  blue.vx += impulse * nx;
  blue.vy += impulse * ny;
}

function roundStep(dt: number): void {
  red.update(dt);
  blue.update(dt);
  collideBalls();
  elapsed += dt;
  if (elapsed >= ROUND_SECONDS) finishRound(red.vy > blue.vy ? 'red' : 'blue');
}

function finishRound(w: 'red' | 'blue'): void {
  if (!running) return;
  running = false;
  winner = w;
  if (w === 'red') redWins++; else blueWins++;
  score.textContent = `${redWins} — ${blueWins}`;
  const name = w === 'red' ? redName.textContent : blueName.textContent;
  status.textContent = `${name} WINS`;
  play.textContent = '▶ NEXT ROUND';
}

function startRound(): void {
  winner = null;
  elapsed = 0;
  accumulator = 0;
  resetBalls();
  running = true;
  status.textContent = 'BATTLE LIVE';
  play.textContent = 'Ⅱ PAUSE';
}

function drawBackground(): void {
  const g = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.max(width, height));
  g.addColorStop(0, '#10223a');
  g.addColorStop(0.55, '#081526');
  g.addColorStop(1, '#040b14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < 45; i++) {
    const x = (i * 83) % width;
    const y = (i * 137) % height;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.restore();
}

function drawArena(): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, arenaRadius, 0, TAU);
  const fill = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, arenaRadius);
  fill.addColorStop(0, 'rgba(22,44,69,.95)');
  fill.addColorStop(1, 'rgba(5,14,25,.98)');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, arenaRadius - 10, 0, TAU);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.setLineDash([7, 10]);
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - arenaRadius, centerY);
  ctx.lineTo(centerX + arenaRadius, centerY);
  ctx.stroke();
  ctx.restore();
}

function drawBall(ball: CountryBall, flag: string): void {
  ctx.save();
  for (let i = 0; i < ball.trail.length; i++) {
    const p = ball.trail[i]!;
    const alpha = (i / ball.trail.length) * 0.14;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ball.team === 'red' ? '#ff3b5c' : '#3d8bff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, BALL_RADIUS * (0.5 + i / ball.trail.length * 0.3), 0, TAU);
    ctx.fill();
  }

  const glow = ctx.createRadialGradient(ball.x, ball.y, BALL_RADIUS * .2, ball.x, ball.y, BALL_RADIUS * 2.2);
  glow.addColorStop(0, ball.team === 'red' ? 'rgba(255,59,92,.45)' : 'rgba(61,139,255,.45)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS * 2.2, 0, TAU);
  ctx.fill();

  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.angle);
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, TAU);
  ctx.clip();
  ctx.font = `${BALL_RADIUS * 1.55}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(flag, 0, 1);
  ctx.restore();

  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, TAU);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ball.team === 'red' ? '#ff5270' : '#58a0ff';
  ctx.stroke();
  ctx.restore();
}

function draw(): void {
  drawBackground();
  drawArena();
  drawBall(red, redFlag.textContent || '🇮🇳');
  drawBall(blue, blueFlag.textContent || '🇺🇸');

  if (running) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.max(0, ROUND_SECONDS - elapsed).toFixed(1)}s`, centerX, centerY + arenaRadius + 25);
    ctx.restore();
  }
}

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (running) {
    accumulator += dt;
    while (accumulator >= FIXED_DT) {
      roundStep(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }
  draw();
  requestAnimationFrame(frame);
}

function updateCountry(side: 'red' | 'blue'): void {
  const select = side === 'red' ? redSelect : blueSelect;
  const target = COUNTRIES.find(([code]) => code === select.value) ?? COUNTRIES[0]!;
  if (side === 'red') {
    redFlag.textContent = target[1];
    redName.textContent = target[2];
  } else {
    blueFlag.textContent = target[1];
    blueName.textContent = target[2];
  }
}

play.addEventListener('click', () => {
  if (running) {
    running = false;
    play.textContent = '▶ RESUME';
    status.textContent = 'PAUSED';
    return;
  }
  startRound();
});

restart.addEventListener('click', () => {
  redWins = 0;
  blueWins = 0;
  score.textContent = '0 — 0';
  startRound();
});
redSelect.addEventListener('change', () => updateCountry('red'));
blueSelect.addEventListener('change', () => updateCountry('blue'));
window.addEventListener('resize', resize);

resize();
draw();
requestAnimationFrame(frame);
