import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  // Shown in backup metadata ("앱 버전").
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: './',
  // Big JSON imports (technique data, postures, canonical map, Gi/No-Gi) become JSON.parse("…")
  // instead of object literals — V8 parses that several times faster, which matters on phones.
  json: { stringify: true },
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
