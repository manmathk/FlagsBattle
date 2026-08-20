import { defineConfig } from 'vite';

// base: './' keeps every asset URL relative, so the same build works on a
// GitHub Pages project path (/<repo>/), a custom domain, and local preview
// without the repo name being baked in.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
