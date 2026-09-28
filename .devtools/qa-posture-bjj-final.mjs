import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-posture-bjj-final-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  async function goto(hash) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise((r) => setTimeout(r, 500));
  }
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }
  function overviewOf() {
    return page.evaluate(() => {
      const h3 = [...document.querySelectorAll('.card.info-card h3')].find((h) => h.textContent?.includes('자세 잡기'));
      return h3?.parentElement?.querySelector('p')?.textContent?.trim() ?? null;
    });
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // Sample across batch4 and batch5 categories
  const samples = [
    'bjj__rear-naked-choke',     // back control
    'bjj__guillotine',           // front headlock
    'bjj__heel-hook',            // leg locks
    'bjj__triangle-choke',       // triangle family
    'bjj__mount',                // armbar family (bare-position id)
    'bjj__kimura-sweep',         // kimura family
    'bjj__arm-drag-back-take',   // arm drag
    'bjj__bridge',               // escape collection
    'bjj__torreando',            // guard pass collection
    'bjj__worm-guard',           // gi-specific
    'bjj__leg-locks',            // no-gi position
    'bjj__50-50',                // ashi garami
  ];

  for (const id of samples) {
    await goto('#/arts/bjj/techniques/' + id);
    const h1 = await textOf('.detail-hero h1');
    check(`[${id}] technique page loads`, !!h1, h1);
    const overview = await overviewOf();
    check(`[${id}] posture overview renders (real text)`, !!overview && overview.length > 5, overview);
    const noPending = !(await textOf('.posture-pending-note'));
    check(`[${id}] does NOT show "준비 중" placeholder`, noPending);
  }

  // Confirm the 3 intentionally-skipped ones still show the honest placeholder
  for (const id of ['bjj__상대의-중심-이동', 'bjj__스크램블-시작', 'bjj__포지션-회복']) {
    await goto('#/arts/bjj/techniques/' + id);
    const pending = await textOf('.posture-pending-note');
    check(`[${id}] intentionally-skipped shows "준비 중"`, (pending ?? '').includes('준비 중'), pending);
  }

  // Confirm original 6 pre-batch entries untouched
  await goto('#/arts/boxing/techniques/boxing__jab');
  const jabStep1 = await textOf('.posture-steps li');
  check('[boxing__jab] pre-existing posture data untouched', (jabStep1 ?? '').includes('기본 복싱 스탠스'), jabStep1);

  // Regression
  await goto('#/');
  const searchBox = await page.$('input[placeholder*="기술"]');
  check('[Regression] Search box present on Home', !!searchBox);
  await goto('#/arts/boxing/techniques/boxing__jab');
  const analyzeBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기')));
  check('[Regression] Pose-analysis button still present', analyzeBtn);

  console.log('\n=== CONSOLE ERRORS (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  fs.writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
