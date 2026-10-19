// Phone-like performance check: production build (vite preview :4173) in Electron's Chromium with
// CPU throttling, phone viewport. Measures startup + navigation to key screens and the heaviest
// functions from a JS CPU profile.  Run: npx vite build && npx vite preview --port 4173 &  node .devtools/perf-mobile.mjs [throttle]
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const THROTTLE = Number(process.argv[2] ?? 6);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const RUNS = Number(process.argv[3] ?? 3);
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync('/tmp/mdex-perf-')}`], env, timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
// The Electron shell first opens the dev app — let it finish and leave it, so none of its work lands in the measurement.
await page.goto('http://localhost:4173/#/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.setViewportSize({ width: 390, height: 800 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await page.evaluate(() => localStorage.clear()).catch(() => {});

const out = { throttle: THROTTLE, steps: [] };
const starts = [];
for (let i = 0; i < RUNS; i++) {
  await page.waitForTimeout(800);
  const t0 = Date.now();
  await page.reload({ waitUntil: 'load' }); // full reload = cold JS start (HTTP cache warm, like a re-opened app)
  await page.waitForSelector('.art-card, .page', { timeout: 120000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  starts.push(Date.now() - t0);
}
starts.sort((a, b) => a - b);
out.steps.push({ step: '앱 시작 → 홈 표시 (중앙값)', ms: starts[Math.floor(starts.length / 2)], all: starts });
await cdp.send('Profiler.start');
let t = Date.now();
const longTasks = await page.evaluate(() => performance.getEntriesByType('longtask')?.length ?? null);
for (const [label, hash, sel] of [
  ['기술 목록', '#/techniques', '.technique-row, .search-result-row, .page'],
  ['기술 상세(그래플링)', '#/arts/bjj/techniques/bjj__armbar', '[data-testid="grappling-style"], .page'],
  ['AI 코치', '#/coach', '.page'],
  ['Visualizing Mitt', '#/coach/mitt', '[data-testid^="mitt-tab-"]'],
  ['나의 기술', '#/my-skills', '.page'],
  ['복습', '#/review', '[data-testid="review-hub"]'],
]) {
  t = Date.now();
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForSelector(sel, { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(50);
  // wait for the main thread to be free (a rAF + a macrotask)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  out.steps.push({ step: label, ms: Date.now() - t });
}
const { profile } = await cdp.send('Profiler.stop');
// self time per function (top)
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const cf = n.callFrame;
  const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
});
out.topSelf = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${Math.round(v)}ms  ${k}`);
out.storage = await page.evaluate(() => Object.keys(localStorage).map((k) => [k, (localStorage.getItem(k) || '').length]).sort((a, b) => b[1] - a[1]).slice(0, 6));
out.longTasksSupported = longTasks;
fs.writeFileSync(path.join(APP_DIR, 'data/audit/perf-mobile.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await app.close();
