import './style.css';
import { AudioEngine } from './audio/AudioEngine';
import { SoundBudget } from './audio/budget';
import { Sfx } from './audio/sfx';
import { createSoundtrack } from './audio/Soundtrack';
import { SIM } from './config';
import { FLAGS } from './data/flags';
import { GameLoop } from './game/GameLoop';
import { CHAMPION_HOLD, Match, WINNER_HOLD } from './game/Match';
import { SERIES_TARGET } from './game/Series';
import { Renderer } from './render/Renderer';
import { themeById } from './render/themes';
import { Controls, MODE_LABELS } from './ui/Controls';
import { Hud } from './ui/Hud';
import { loadPreferences, savePreferences } from './ui/preferences';

/** localStorage access itself throws in some privacy modes, so probe it once. */
const safeStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** Ignore huge frame deltas from a backgrounded tab rather than simulating them. */
const MAX_FRAME_DT = 0.25;

/**
 * Sound-effect rate limits. Impacts need the tightest leash: 197 orbiting bodies
 * generate hundreds of collision events a second even after the world's impact
 * threshold, and playing them all is unlistenable.
 */
const SOUND_LIMITS = {
  impact: { maxPerFrame: 3, cooldownMs: 45 },
  elimination: { maxPerFrame: 2, cooldownMs: 30 },
} as const;

const main = async (): Promise<void> => {
  const canvas = document.getElementById('stage');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('main: #stage is not a canvas');

  const storage = safeStorage();
  const preferences = loadPreferences(storage);
  let theme = themeById(preferences.themeId);

  const hud = new Hud();
  hud.applyTheme(theme);

  const renderer = await Renderer.create(canvas, theme);
  const flagCodes = FLAGS.map((flag) => flag.code);
  const loop = new GameLoop();

  const audio = new AudioEngine();
  const soundtrack = createSoundtrack(audio);
  const sfx = new Sfx(audio);
  const budget = new SoundBudget(SOUND_LIMITS);
  let muted = preferences.muted;

  /**
   * Give the renderer the vertical band between the results strip and the
   * controls. Measured from the DOM rather than hardcoded because the strip grows
   * and shrinks as blocks appear — but only on layout events, never per frame,
   * since reading these forces a reflow.
   */
  const layoutArena = (): void => {
    const strip = document.getElementById('results')?.getBoundingClientRect();
    const controls = document.getElementById('controls')?.getBoundingClientRect();
    renderer.resize({
      top: (strip?.bottom ?? 0) + 12,
      bottom: controls === undefined ? 0 : window.innerHeight - controls.top + 12,
    });
  };


  const match = new Match(preferences.modeId, flagCodes, Date.now(), {
    onRoundStart: (round, series, leaderboard) => {
      renderer.bindRound(round.world);
      hud.hideBanner();
      hud.setMode(MODE_LABELS[round.mode.id]);
      hud.showSeries(round.mode.usesSeries);
      hud.setSeries(series.standings(), SERIES_TARGET);
      // Also refreshes the card after a Reset, which clears the tally.
      hud.setLastWinner(leaderboard.lastWinner);
      hud.setTopFive(leaderboard.top(5), leaderboard.roundsPlayed);
      layoutArena();
    },
    onRoundEnd: ({ winnerCode, isChampion }, series, leaderboard) => {
      sfx.winner(isChampion);
      hud.setSeries(series.standings(), SERIES_TARGET);
      hud.setLastWinner(leaderboard.lastWinner);
      hud.setTopFive(leaderboard.top(5), leaderboard.roundsPlayed);
      // Derived from the intermission length, not duplicated: if these drift
      // apart the banner either vanishes mid-celebration or overlays the next
      // round's opening.
      hud.showWinner(
        winnerCode,
        isChampion ? `Champion — ${SERIES_TARGET} wins` : 'Round winner',
        isChampion,
        (isChampion ? CHAMPION_HOLD : WINNER_HOLD) * 1000,
      );
    },
  });

  const controls = new Controls(
    {
      onTogglePlay: () => {
        loop.toggle();
        controls.setPlaying(loop.running);
      },
      onReset: () => {
        loop.reset();
        match.reset();
      },
      onToggleSound: () => {
        muted = !muted;
        controls.setMuted(muted);
        savePreferences(storage, { modeId: match.mode.id, themeId: theme.id, muted });

        // Unlocking has to happen inside the click, so do it before awaiting.
        void audio.unlock().then(() => {
          audio.setMuted(muted);
          if (muted) soundtrack.stop();
          else soundtrack.start();
        });
      },
      onModeChange: (modeId) => {
        match.setMode(modeId);
        savePreferences(storage, { modeId, themeId: theme.id, muted });
      },
      onThemeChange: (themeId) => {
        theme = themeById(themeId);
        renderer.setTheme(theme);
        hud.applyTheme(theme);
        savePreferences(storage, { modeId: match.mode.id, themeId: theme.id, muted });
      },
    },
    preferences,
  );
  controls.setPlaying(loop.running);
  controls.setMuted(muted);

  window.addEventListener('resize', layoutArena);

  /** One frame: advance the simulation, then draw it. */
  const tick = (dt: number): void => {
    const steps = loop.advance(dt);
    for (let i = 0; i < steps; i++) match.step(SIM.fixedStep);

    const world = match.round.world;
    const events = world.drainEvents();

    budget.beginFrame(performance.now());
    for (const event of events) {
      switch (event.type) {
        case 'chaosEvent':
          hud.showChaosEvent(event.kind);
          sfx.chaosEvent();
          break;
        case 'lightning':
          sfx.lightning();
          break;
        case 'eliminated':
          if (budget.allow('elimination')) sfx.elimination();
          break;
        case 'collision':
        case 'wallBounce':
          // Impact strength normalised against the speed clamp.
          if (budget.allow('impact')) sfx.impact(Math.min(1, event.impact / SIM.maxSpeed));
          break;
      }
    }

    // Music tightens as the field thins.
    soundtrack.setIntensity(1 - world.aliveCount / world.bodies.length);
    soundtrack.update();

    renderer.frame(world, loop.alpha, dt, events);
    hud.setAlive(world.aliveCount, world.bodies.length);
  };

  if (import.meta.env.DEV) {
    // Dev-only handle, stripped from production builds. Worth having because
    // requestAnimationFrame is suspended in a hidden tab, which otherwise makes
    // a running match impossible to inspect.
    Object.assign(window, {
      __flagsbattle: {
        match,
        loop,
        renderer,
        audio,
        soundtrack,
        sfx,
        /**
         * Run `seconds` of simulation now, frame by frame at 60fps. It drives the
         * same tick as the real loop rather than stepping the match directly, so
         * effect lifetimes advance too — otherwise every elimination burst in the
         * window would spawn on one frame and pile into one bright blob.
         */
        fastForward(seconds: number): void {
          const frameDt = 1 / 60;
          for (let i = 0; i < Math.round(seconds / frameDt); i++) tick(frameDt);
        },
      },
    });
  }

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;
    tick(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

main().catch((error: unknown) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<p style="padding:24px;font:600 15px system-ui;color:#fca5a5">FlagsBattle failed to start — see the browser console.</p>',
  );
});
