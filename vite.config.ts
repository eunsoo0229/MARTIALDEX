import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    // Measured live on the packaged production app: esbuild's minifier (Vite's
    // default) produces output V8 parses pathologically slowly for this
    // bundle — domContentLoadedEventEnd was ~4000ms on a fresh launch with
    // esbuild minification, vs ~530ms with minification disabled entirely
    // (same code, larger file) and ~530ms again with terser. This is a known
    // V8 quadratic-parse gotcha for esbuild's very-long-single-line minified
    // output on large bundles; terser wraps output more conservatively and
    // avoids it while still minifying (bundle size stays comparable to the
    // esbuild-minified version, unlike disabling minification which balloons
    // the main chunk from ~3.2MB to ~4.6MB).
    minify: 'terser',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
