// Signed-out viewer check: the curated combos published by the operator are listed in 사용자 콤보,
// searchable, and a setup's detail page shows its steps with the opponent reaction. Read-only.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + JSON.stringify(detail).slice(0, 500) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-cur-ui-'))}`], env, timeout: 120000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.waitForLoadState('load');
await sleep(1200);
await page.evaluate(() => { window.location.hash = '#/user-combos'; });
await page.locator('[data-testid="user-combos-list"]').waitFor({ timeout: 30000 });
await page.locator('[data-testid="combo-sort-latest"]').click();
await sleep(1500);
const total = await page.locator('[data-testid="user-combos-list"] > *').count();
await page.locator('[data-testid="combo-search"]').fill('1-6-3-2');
await sleep(800);
const hit = await page.locator('[data-testid="user-combos-list"]').innerText();
check('[U1] 사용자 콤보 목록에 운영자 큐레이션 콤보가 보이고 검색됨 (1-6-3-2)', total >= 150 && hit.includes('Rear Uppercut') && hit.includes('MARTIALDEX'), { total, hit: hit.slice(0, 200) });
const d = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data/audit/curated-combos-publish.json'), 'utf8'));
const setup = d.publishedRows.find((r) => r.kind === 'setup' && r.art === 'wrestling');
await page.evaluate((id) => { window.location.hash = `#/user-combos/${encodeURIComponent(id)}`; }, setup.id);
await page.locator('[data-testid="shared-combo-detail"]').waitFor({ timeout: 30000 });
await sleep(800);
const detail = await page.locator('[data-testid="shared-combo-detail"]').innerText();
const steps = await page.locator('[data-testid="combo-step"]').count();
const all = await page.locator('main, .page').first().innerText();
check('[U2] 셋업 상세: 단계·상대 반응·출처 표시', steps >= 2 && /반응/.test(all) && /운영자 큐레이션/.test(all), { name: setup.name, steps, detail: detail.slice(0, 300) });
check('[U3] 페이지 오류 없음', errors.length === 0, errors);
await app.close();
process.exit(results.every(Boolean) ? 0 : 1);
