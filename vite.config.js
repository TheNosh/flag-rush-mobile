import { defineConfig } from 'vite';

// base './' laat de build werken op elke GitHub Pages-URL (bv. thenosh.github.io/flag-rush/).
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
