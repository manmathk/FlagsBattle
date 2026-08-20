# FlagsBattle

A physics battle royale between the flags of the world. 197 countries orbit a
circular arena as spinning balls, collide, and are eliminated until one survives.
Three game modes, fourteen arena themes, and it runs unattended forever.

Deployed as a fully static site — no backend, no API keys, no runtime network calls.

## Quick start

```bash
npm install
npm run dev
```

The page auto-starts. `Space` pauses, `R` resets, `M` toggles sound.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm test` | Full test suite (headless, no browser) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build into `dist/` |
| `npm run build:atlas` | Regenerate the flag atlas — see below |

## Physics

Flags are balls, not falling discs. Every mode runs on a shared **orbital field**:
a constant pull toward the arena centre plus a tangential drive. The pull alone
would collapse the field into a blob in the middle where the gap can never reach
it — the tangential term is what makes it an orbit, and the two are balanced so
the steady-state radius lands at the wall. The arena becomes a centrifuge: flags
ride the ring in a rotating band and get flung out as the gap sweeps past.

Contacts use **Coulomb friction** with real rotational dynamics. Discs have
`I = ½mr²`, so for two equal discs the tangential effective mass is exactly 6 and
the wall case is 3; the impulse is clamped to `μ|jₙ|`, so friction can only ever
cancel sliding, never reverse it. The visible result is rolling — flags spin up as
they grind along the wall and against each other.

One consequence worth knowing: the drain is a smooth exponential (roughly two
thirds of the field goes in the first ten seconds, then a long tense endgame).
That is a change in shape from downward gravity, which drained only when the gap
swept the bottom and so had flat stretches where nothing happened at all.

## Audio

Sound is **off by default** and starts from a click — browsers block audio outside
a user gesture, so that is policy rather than preference. The 🔊 button (or `M`)
unlocks it.

By default the soundtrack is **generated in the browser** from oscillators: no
audio files, nothing to licence, nothing to download. The score is a pure function
of `(step, intensity)` with no randomness, so it is unit-testable, and it builds
through the round — bass throughout, an arpeggio once the field thins, percussion
later, tempo rising with `1 − aliveFraction`. Effects (impacts, eliminations,
lightning cracks, a winner sting) are synthesised the same way.

Impact sounds are rate-limited, and that is load-bearing rather than polish: 197
orbiting bodies produce hundreds of collision events per second even after the
world's impact threshold, which is both unlistenable and a per-frame spike. The
limiter caps *simultaneous* sounds per frame and separately caps how often frames
may play a given kind at all.

**To use your own music**, drop one audio file into `src/audio/tracks/` and
rebuild; it replaces the generated score entirely. See the README in that folder
for why tracks live under `src/` rather than `public/`. The repo ships no audio —
add only what you have the rights to distribute.

## Game modes

- **Normal** — a gap sweeps around the ring, flinging out whatever is riding the
  wall as it passes. Runs a first-to-three series and crowns a champion.
- **Lightning** — closed ring, no drain. Bolts pick flags off at random, in
  batches scaled to the surviving field. Because strikes are purely time-based,
  this is the one mode whose round length does not vary with the seed at all.
- **Chaos** — the arena shrinks and drifts while vortex, wind, speed-burst and
  spin events shove the field toward the gap.

## Architecture

The governing rule: **nothing under `core/`, `modes/` or `game/` imports Pixi,
touches the DOM, or reads a clock.** The simulation is pure TypeScript over
numbers and the renderer is a read-only observer of world state. That is what
makes a full 197-flag round testable in Node without a browser, and it is the
seam to protect.

```
src/
  core/     Vec2, Rng, Body, forces, SpatialGrid, Arena, World   ← pure
  modes/    GameMode + Normal / Lightning / Chaos                ← pure
  game/     GameLoop, spawn, Round, Series, Leaderboard, Match   ← pure
  audio/    composition + budget (pure); AudioEngine, music, sfx
  render/   Pixi: Renderer, ArenaRing, Effects, themes
  ui/       DOM: Hud, Controls, preferences
  data/     flags.ts, atlas.json (both generated)
tools/      gen-flags.mjs, build-atlas.ts
```

Notes on a few decisions that aren't obvious from the code:

- **Fixed 1/120s timestep** with a capped accumulator. Variable dt makes a dense
  pack of 197 circles jitter and gain energy; a fixed step plus a seeded PRNG also
  makes any round reproducible from its seed, which is what lets the tests assert
  real invariants.
- **Two tallies, two lifetimes.** `Series` is the first-to-three race and clears
  the moment a champion is crowned. `Leaderboard` is the session tally behind the
  results card: it spans every mode, survives mode switches, and is cleared only
  by the Reset button. They share an implementation but never a lifetime.
- **Uniform-grid broad phase.** 197 bodies is ~19k naive pair checks per step;
  bucketing by cell cuts that to roughly 1–2k. Each pair is offered exactly once —
  resolving one collision twice injects energy and the pack slowly boils.
- **Sudden death is per-mode.** Every round has a 150s cap, after which Normal and
  Chaos shrink the arena. Lightning instead strikes faster, because shrinking a
  ring with no gap eliminates nobody.
- **One flag atlas, no bloom filter.** All 197 sprites share one texture and so
  batch into essentially one draw call, and the glow is an additive halo sprite
  rather than a real multi-pass blur, which would not hold 60fps over 197 sprites.
- **The HUD is DOM, not Pixi** — crisper text, real accessibility, CSS-themable.
  The themed background is likewise a CSS gradient behind a transparent canvas.

Round lengths are tuned against measurement rather than derived; the integration
tests print the measured duration per mode and guard the target band. Measured
across twelve seeds: Normal 44.5–81.9s (median 59s), Chaos 44.3–75.5s (median
65s), Lightning a flat 62.0s.

The results strip sits under the top badges rather than beside the arena, and the
renderer sizes the arena to fit the band the HUD leaves it — scaling off the
arena's own diameter, not off letterboxing the 16:9 logical stage, which on a
portrait phone shrank it to about a fifth of the screen.

## Regenerating the flag assets

The atlas (`public/atlas/flags.png` + `src/data/atlas.json`) is **committed**.
That is deliberate: generating it needs `sharp`, and native modules are the most
common cause of CI deploy failures — so CI runs a plain `vite build` with no image
toolchain at all.

Only re-run this when the flag list changes. It needs **Node ≥ 20.9** (a sharp
constraint; everything else in the project runs on Node 18):

```bash
nvm use 22 && npm run build:atlas
```

`tools/gen-flags.mjs` regenerates `src/data/flags.ts` from the ISO country list,
resolving names via `Intl.DisplayNames` and validating that every code has an SVG.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` typechecks, tests, builds and publishes on every
push to `main`. Two things have to be done by hand once:

1. Create the GitHub remote and push.
2. In **Settings → Pages**, set the source to **GitHub Actions**.

Pages-specific constraints the build already handles:

| Constraint | Handling |
| --- | --- |
| Served from `/<repo>/`, not `/` | `base: './'` — relative URLs work on a project page, a custom domain and local preview alike |
| Jekyll strips some paths | `.nojekyll` is emitted into `dist/` |
| CI is Linux and case-sensitive | Flag codes and asset names are lowercase, enforced by the generator and a test — a casing slip is invisible on macOS and 404s only in production |
| No custom HTTP headers | Nothing depends on COOP/COEP; the physics is single-threaded |

## Not included

Deliberate exclusions, not oversights:

- **No viewer interaction or shield system.** Chat-driven shields need a server to
  poll the YouTube API, which static hosting cannot provide. The simulation is
  fully autonomous.
- **No licensed music.** Licensed audio cannot be bundled into a public
  repository, so the shipped soundtrack is synthesised in the browser instead.
  `src/audio/tracks/` is the slot for supplying your own.
