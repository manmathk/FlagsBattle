import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'guess-the-flag-continuous-loop',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          if (ctx.path.endsWith('/guess-the-flag-100.html') || ctx.path === '/guess-the-flag-100.html') {
            return html.replace('</body>', '<script src="./guess-the-flag-loop.js"></script></body>');
          }
          return html;
        },
      },
    },
  ],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: 'index.html',
        gravityBattle: 'gravity-battle.html',
        bombArena: 'bomb-arena.html',
        bombArenaTop50: 'bomb-arena-top50.html',
        guessTheFlag100: 'guess-the-flag-100.html',
      },
    },
  },
});
