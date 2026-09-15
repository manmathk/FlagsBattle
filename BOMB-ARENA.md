# Bomb Arena implementation

The new `bomb-arena.html` is a standalone 9:16 broadcast scene added alongside the existing FlagsBattle game.

## Behavior
- Uses the existing `src/data/flags.ts` country dataset.
- Circular neon arena with concentric rings, matching the visual language of the supplied reference.
- Every country flag is placed around the arena.
- After a 5-second arming phase, one random surviving country is selected.
- A bomb follows the target with a visible fuse; after the fuse, the country is eliminated with flash/particle effects and a boom SFX.
- Voice announcement is available with browser SpeechSynthesis.
- The next target is chosen automatically after a brief delay.
- The last surviving country wins the round; after a short winner hold the next round starts automatically.
- Pause, reset, sound and voice controls are included.
- Uses `flagcdn.com` for flag images, so the page needs network access when streamed from a static host.

## Local preview
Open with a static HTTP server from the repository root so the TypeScript flag dataset import is served correctly.
