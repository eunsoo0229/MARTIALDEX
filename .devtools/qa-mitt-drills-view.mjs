// 공격 지시 / 반응 훈련 — the mitt view must actually be visible while a round runs.
// Run: node .devtools/qa-mitt-drills-view.mjs   (Electron + Vite dev server)
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 300) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR], env, timeout: 30000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.waitForLoadState('load');
await sleep(1500);
await page.evaluate(() => (location.hash = '#/coach/mitt'));
await sleep(1500);
await page.evaluate(() => [...document.querySelectorAll('.modal-overlay button')].find((b) => b.textContent?.trim() === '나중에')?.click());

const viewState = (scope) =>
  page.evaluate((sel) => {
    const f = document.querySelector(`${sel} [data-testid="mitt-front"]`);
    if (!f) return { present: false };
    const r = f.getBoundingClientRect();
    const target = f.querySelector('[data-testid="mitt-target"]')?.getBoundingClientRect();
    return { present: true, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, targetVisible: !!target && target.top >= 0 && target.bottom <= innerHeight };
  }, scope);

// 공격 지시
await page.evaluate(() => document.querySelector('[data-testid="mitt-tab-command"]')?.click());
await sleep(500);
await page.evaluate(() => document.querySelector('[data-testid="command-start"]')?.click());
await sleep(6800); // 5 s ready countdown + first call
let v = await viewState('[data-testid="command-drill"]');
check('[공격 지시] 라운드 중 미트 화면(코치·미트) 표시', v.present, v);
check('[공격 지시] 미트 화면 전체가 창 안에 보임 (크기 제한 + 자동 스크롤)', v.present && v.top >= 0 && v.bottom <= v.vh && v.h <= 0.8 * v.vh, v);
check('[공격 지시] 지금 칠 미트가 화면 안에 있음', v.targetVisible, v);
await page.evaluate(() => document.querySelector('[data-testid="command-stop"]')?.click());

// 반응 훈련
await page.evaluate(() => document.querySelector('[data-testid="mitt-tab-react"]')?.click());
await sleep(500);
await page.evaluate(() => document.querySelector('[data-testid="reaction-start"]')?.click());
await sleep(900);
v = await viewState('[data-testid="reaction-drill"]');
check('[반응 훈련] 부른 콤보대로 미트 화면 표시', v.present, v);
check('[반응 훈련] 미트 화면 전체가 창 안에 보임', v.present && v.top >= 0 && v.bottom <= v.vh, v);
const combo = await page.evaluate(() => document.querySelector('[data-testid="reaction-call"]')?.dataset.combo);
check('[반응 훈련] 실제 콤보를 불러 줌', !!combo, combo);
await page.evaluate(() => document.querySelector('[data-testid="reaction-stop"]')?.click());

check('페이지 오류 없음', errors.length === 0, errors.slice(0, 3));
await app.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
