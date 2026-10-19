// 미트 훈련 전 콤보 영상 — live in-app check (Electron + Vite dev server; real YouTube search + AI check).
// Run: node .devtools/qa-mitt-combo-videos.mjs
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-combo-videos-'));
const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 400) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR], env, timeout: 30000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(1200);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dismiss = () => page.evaluate(() => [...document.querySelectorAll('.modal-overlay button')].find((b) => b.textContent?.trim() === '나중에')?.click());

await page.evaluate(() => (location.hash = '#/coach/mitt'));
await sleep(1500);
await dismiss();
await page.evaluate(() => document.querySelector('[data-testid="mitt-tab-db"]')?.click());
await sleep(600);
const pick = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid="mitt-combo-option"]')];
  const row = rows.find((r) => /Jab → Cross → Lead Hook/.test(r.textContent ?? '')) ?? rows.find((r) => /Jab → Cross/.test(r.textContent ?? ''));
  row?.querySelector('[data-testid="mitt-combo-start"]')?.click();
  return row?.querySelector('.technique-row__name')?.textContent ?? null;
});
await sleep(1500);
check('[진입] 추천 콤보 선택 → 연습 화면', !!pick && !!(await page.$('[data-testid="mitt-run-mode"]')), pick);
check('[표시] 연습 시작 전 "연습 전에 영상 보기" 패널', !!(await page.$('[data-testid="combo-videos"]')));
const t0 = Date.now();
let st = 'searching';
while (Date.now() - t0 < 150000) {
  st = await page.evaluate(() => document.querySelector('[data-testid="combo-videos"]')?.getAttribute('data-status') ?? 'missing');
  if (st !== 'searching') break;
  await sleep(2000);
}
const info = await page.evaluate(() => ({
  status: document.querySelector('[data-testid="combo-videos"]')?.getAttribute('data-status'),
  titles: [...document.querySelectorAll('[data-testid="lesson-video-item"] strong')].map((e) => e.textContent),
  player: document.querySelector('[data-testid="lesson-video-player"] iframe')?.getAttribute('src') ?? null,
  text: document.querySelector('[data-testid="combo-videos-panel"]')?.innerText.slice(0, 300),
}));
console.log('   결과:', JSON.stringify(info));
check('[검색] 검색이 끝나고 결과 상태가 표시됨 (found / none / error 중 하나)', ['found', 'none', 'error'].includes(info.status), info.status);
if (info.status === 'found') check('[재생] 찾은 영상은 앱 안에서 재생 (YouTube embed)', !!info.player && info.player.startsWith('https://www.youtube.com/embed/'), info.player);
await page.screenshot({ path: path.join(SHOT, 'combo-videos.png') });
check('[연습] 영상 패널이 있어도 미트 연습(시작 버튼)은 그대로', !!(await page.$('[data-testid="mitt-continuous"]')));
await page.evaluate(() => document.querySelector('.combo-videos > summary')?.click());
await sleep(300);
check('[접기] 패널을 접을 수 있음', await page.evaluate(() => !document.querySelector('[data-testid="combo-videos"]')?.hasAttribute('open')));
check('페이지 오류 없음', errors.length === 0, errors.slice(0, 3));
console.log('screenshot:', SHOT);
await app.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
