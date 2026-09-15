import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: 'index.html',
        gravityBattle: 'gravity-battle.html',
        bombArena: 'bomb-arena.html',
        bombArenaTop50: 'bomb-arena-top50.html',
      },
    },
  },
});
