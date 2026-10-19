// Visualizing Mitt — defense / counter combos and "방어 포함" in 공격 지시 (Electron + Vite dev server).
// Run: node .devtools/qa-mitt-defense.mjs
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-mitt-defense-'));
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

// 1. DB counter combo in the recommended list
await page.evaluate(() => document.querySelector('[data-testid="mitt-tab-db"]')?.click());
await sleep(600);
const names = await page.evaluate(() => [...document.querySelectorAll('[data-testid="mitt-combo-option"] .technique-row__name')].map((e) => e.textContent));
const defNames = names.filter((n) => /^(Slip|Parry|Roll|Block|Catch|Check)/.test(n ?? ''));
check('[추천 콤보] 방어 → 카운터 기록이 목록에 표시', defNames.length >= 3, defNames);
const roles = await page.evaluate(() => [...document.querySelectorAll('[data-testid="mitt-combo-option"]')].find((r) => /^Slip/.test(r.querySelector('.technique-row__name')?.textContent ?? ''))?.querySelector('.technique-row__sub')?.textContent ?? '');
check('[추천 콤보] 단계 역할이 "방어·회피 → 카운터"', /방어·회피 → 카운터/.test(roles), roles);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('[data-testid="mitt-combo-option"]')].find((r) => /^Slip/.test(r.querySelector('.technique-row__name')?.textContent ?? ''));
  row?.querySelector('[data-testid="mitt-combo-start"]')?.click();
});
await sleep(1500);
// continuous run: press start, wait for the 5 s countdown, sample frames
await page.evaluate(() => [...document.querySelectorAll('[data-testid="mitt-continuous"] button')].find((b) => /시작/.test(b.textContent ?? ''))?.click());
const seen = { defense: false, result: null, incoming: false, counterStrike: false };
const t0 = Date.now();
let shot = false;
while (Date.now() - t0 < 14000) {
  const f = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="mitt-runner"] [data-testid="mitt-front"]');
    return v ? { kind: v.getAttribute('data-kind'), path: v.getAttribute('data-path'), incoming: !!v.querySelector('[data-testid="mitt-incoming"]'), result: v.querySelector('[data-testid="mitt-defense-result"]')?.textContent ?? null, label: v.querySelector('[data-testid="mitt-incoming-label"]')?.textContent ?? null } : null;
  });
  if (f?.kind === 'defense') {
    seen.defense = true;
    seen.incoming ||= f.incoming;
    if (f.result) seen.result = f.result;
    if (f.result && !shot) {
      await page.locator('[data-testid="mitt-runner"] [data-testid="mitt-front"]').screenshot({ path: path.join(SHOT, 'defense.png') });
      shot = true;
    }
  } else if (seen.defense && f && !f.kind) seen.counterStrike = true;
  await sleep(60);
}
check('[연습] 방어 단계: 코치가 공격을 뻗는 화면(들어오는 미트)', seen.defense && seen.incoming, seen);
check('[연습] 방어 결과 표시 ("피했다!" 등)', !!seen.result, seen.result);
check('[연습] 방어 뒤 카운터 타격 화면으로 이어짐', seen.counterStrike, seen);

// 2. 공격 지시 + 방어 포함
await page.evaluate(() => (location.hash = '#/coach/mitt'));
await sleep(1200);
await page.evaluate(() => document.querySelector('[data-testid="mitt-tab-command"]')?.click());
await sleep(500);
await page.evaluate(() => document.querySelector('[data-testid="command-defense"]')?.click());
await page.evaluate(() => document.querySelector('[data-testid="command-level-mixed"]')?.click());
await sleep(300);
await page.evaluate(() => document.querySelector('[data-testid="command-start"]')?.click());
let defCall = null;
const t1 = Date.now();
while (Date.now() - t1 < 45000 && !defCall) {
  defCall = await page.evaluate(() => (document.querySelector('[data-testid="command-drill"] [data-testid="mitt-front"]')?.getAttribute('data-kind') === 'defense' ? document.querySelector('[data-testid="command-call"]')?.textContent : null));
  await sleep(150);
}
check('[공격 지시] "방어 포함" → 코치가 공격을 뻗고 방어 지시가 나옴', !!defCall, defCall);
await page.evaluate(() => document.querySelector('[data-testid="command-stop"]')?.click());

check('페이지 오류 없음', errors.length === 0, errors.slice(0, 3));
console.log('screenshot:', SHOT);
await app.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
