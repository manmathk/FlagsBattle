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

const safeStorage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

const MAX_FRAME_DT = 0.25;
const SOUND_LIMITS = {
  impact: { maxPerFrame: 3, cooldownMs: 45 },
  elimination: { maxPerFrame: 2, cooldownMs: 30 },
} as const;

/** Chrome/Chromium native speech synthesis. No external API, audio file, or network request. */
class WinnerVoice {
  private enabled = false;
  private selectedVoice: SpeechSynthesisVoice | undefined;

  constructor() {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    const chooseVoice = (): void => {
      const voices = window.speechSynthesis.getVoices();
      this.selectedVoice =
        voices.find((voice) => /^en(-|_)/i.test(voice.lang) && /Google|Chrome|Microsoft/i.test(voice.name)) ??
        voices.find((voice) => /^en(-|_)/i.test(voice.lang)) ??
        voices[0];
    };
    chooseVoice();
    window.speechSynthesis.addEventListener('voiceschanged', chooseVoice);
  }

  unlock(): void {
    this.enabled = 'speechSynthesis' in window;
  }

  speakRoundWinner(country: string, roundNumber: number): void {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    const text = `Round ${roundNumber} winner: ${country}!`;
    this.speak(text, false);
  }

  speakChampion(country: string): void {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    this.speak(`We have a champion! ${country} is the FlagsBattle champion!`, true);
  }

  private speak(text: string, champion: boolean): void {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = champion ? 0.9 : 1;
    utterance.pitch = champion ? 1.05 : 1;
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    window.speechSynthesis.speak(utterance);
  }
}

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
  const winnerVoice = new WinnerVoice();
  let muted = preferences.muted;

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
      hud.setLastWinner(leaderboard.lastWinner);
      hud.setTopFive(leaderboard.top(5), leaderboard.roundsPlayed);
      layoutArena();
    },
    onRoundEnd: ({ winnerCode, isChampion }, series, leaderboard) => {
      sfx.winner(isChampion);
      hud.setSeries(series.standings(), SERIES_TARGET);
      hud.setLastWinner(leaderboard.lastWinner);
      hud.setTopFive(leaderboard.top(5), leaderboard.roundsPlayed);
      if (isChampion) winnerVoice.speakChampion(hud.countryName(winnerCode));
      else winnerVoice.speakRoundWinner(hud.countryName(winnerCode), leaderboard.roundsPlayed);
      hud.showWinner(
        winnerCode,
        isChampion ? `🏆 Champion — ${SERIES_TARGET} wins` : `🚩 Round ${leaderboard.roundsPlayed} winner`,
        isChampion,
        (isChampion ? CHAMPION_HOLD : WINNER_HOLD) * 1000,
      );
      layoutArena();
    },
  });

  const controls = new Controls(
    {
      onTogglePlay: () => { loop.toggle(); controls.setPlaying(loop.running); },
      onReset: () => { loop.reset(); match.reset(); },
      onToggleSound: () => {
        muted = !muted;
        controls.setMuted(muted);
        winnerVoice.unlock();
        savePreferences(storage, { modeId: match.mode.id, themeId: theme.id, muted });
        void audio.unlock().then(() => {
          audio.setMuted(muted);
          if (muted) soundtrack.stop(); else soundtrack.start();
        });
      },
      onModeChange: (modeId) => { match.setMode(modeId); savePreferences(storage, { modeId, themeId: theme.id, muted }); },
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

  // A click anywhere on the page can unlock Chromium speech without requiring the user to use the sound toggle.
  window.addEventListener('pointerdown', () => winnerVoice.unlock(), { once: true, passive: true });
  window.addEventListener('resize', layoutArena);

  const tick = (dt: number): void => {
    const steps = loop.advance(dt);
    for (let i = 0; i < steps; i++) match.step(SIM.fixedStep);
    const world = match.round.world;
    const events = world.drainEvents();
    budget.beginFrame(performance.now());
    for (const event of events) {
      switch (event.type) {
        case 'chaosEvent': hud.showChaosEvent(event.kind); sfx.chaosEvent(); break;
        case 'lightning': sfx.lightning(); break;
        case 'eliminated': if (budget.allow('elimination')) sfx.elimination(); break;
        case 'collision':
        case 'wallBounce': if (budget.allow('impact')) sfx.impact(Math.min(1, event.impact / SIM.maxSpeed)); break;
      }
    }
    soundtrack.setIntensity(1 - world.aliveCount / world.bodies.length);
    soundtrack.update();
    renderer.frame(world, loop.alpha, dt, events);
    hud.setAlive(world.aliveCount, world.bodies.length);
  };

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __flagsbattle: {
        match, loop, renderer, audio, soundtrack, sfx,
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
  document.body.insertAdjacentHTML('afterbegin', '<p style="padding:24px;font:600 15px system-ui;color:#fca5a5">FlagsBattle failed to start — see the browser console.</p>');
});
