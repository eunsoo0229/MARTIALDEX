import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-posture-mkt-shots';
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

  const muayThaiSamples = [
    'muay-thai__muay-thai-stance', 'muay-thai__lead-teep-rear-teep',            // MT1
    'muay-thai__lead-round-kick-rear-round-kick', 'muay-thai__jab-cross',        // MT2
    'muay-thai__sok-tad', 'muay-thai__khao-trong',                               // MT3
    'muay-thai__single-collar-tie-double-collar-tie',                           // MT4
    'muay-thai__kick-catch-teep-catch', 'muay-thai__shoulder-block',            // MT5
    'muay-thai__jab-counter-cross-counter-hook-counter', 'muay-thai__spinning-elbow', // MT6
  ];
  const karateSamples = [
    'karate__zenkutsu-dachi', 'karate__ayumi-ashi',                              // KA1
    'karate__gyaku-zuki',                                                        // KA2
    'karate__mawashi-geri', 'karate__age-uke',                                   // KA3
    'karate__long-guard-distance-control',                                       // KA4
    'karate__kizami-zuki-gyaku-zuki',                                            // KA5
    'karate__sen', 'karate__kote-gaeshi', 'karate__ibuki',                       // KA6
  ];
  const taekwondoSamples = [
    'taekwondo__나란히서기', 'taekwondo__뒷굽이',                                  // TKD1
    'taekwondo__바로지르기-반대지르기', 'taekwondo__몸통막기',                      // TKD2
    'taekwondo__돌려차기', 'taekwondo__뒷발-돌려차기',                             // TKD3
    'taekwondo__뒤돌아차기-계열', 'taekwondo__앞발-돌려차기-뒷발-돌려차기',          // TKD4
    'taekwondo__위력격파', 'taekwondo__앞낙법-뒤낙법-옆낙법',                       // TKD5
  ];

  for (const [art, samples] of [['muay-thai', muayThaiSamples], ['karate', karateSamples], ['taekwondo', taekwondoSamples]]) {
    for (const id of samples) {
      await goto(`#/arts/${art}/techniques/${id}`);
      const h1 = await textOf('.detail-hero h1');
      check(`[${id}] technique page loads`, !!h1, h1);
      const overview = await overviewOf();
      check(`[${id}] posture overview renders (real text)`, !!overview && overview.length > 5, overview);
      const noPending = !(await textOf('.posture-pending-note'));
      check(`[${id}] does NOT show "준비 중" placeholder`, noPending);
    }
  }

  // Confirm intentionally-skipped entries show the honest placeholder
  for (const [art, id] of [['karate', 'karate__특징'], ['karate', 'karate__대표-기술'], ['karate', 'karate__대표-가타'], ['taekwondo', 'taekwondo__태극-1장'], ['taekwondo', 'taekwondo__대표-기술']]) {
    await goto(`#/arts/${art}/techniques/${id}`);
    const pending = await textOf('.posture-pending-note');
    check(`[${id}] intentionally-skipped shows "준비 중"`, (pending ?? '').includes('준비 중'), pending);
  }

  // Confirm prior-session data (BJJ/Boxing/Wrestling/Judo/Kickboxing/Sambo) untouched
  await goto('#/arts/bjj/techniques/bjj__armbar');
  const armbarStep1 = await textOf('.posture-steps li');
  check('[bjj__armbar] pre-existing posture data untouched', (armbarStep1 ?? '').includes('클로즈드 가드에서 상대의 한쪽 팔을'), armbarStep1);

  await goto('#/arts/judo/techniques/judo__osoto-gari');
  const osotoOverview = await overviewOf();
  check('[judo__osoto-gari] pre-existing posture data untouched', !!osotoOverview && osotoOverview.length > 5, osotoOverview);

  await goto('#/arts/kickboxing/techniques/kickboxing__orthodox');
  const kbOverview = await overviewOf();
  check('[kickboxing__orthodox] pre-existing posture data untouched', !!kbOverview && kbOverview.length > 5, kbOverview);

  await goto('#/arts/sambo/techniques/sambo__мельница');
  const samboOverview = await overviewOf();
  check('[sambo__мельница] pre-existing posture data untouched', !!samboOverview && samboOverview.length > 5, samboOverview);

  // Regression
  await goto('#/');
  const searchBox = await page.$('input[placeholder*="기술"]');
  check('[Regression] Search box present on Home', !!searchBox);
  await goto('#/arts/boxing/techniques/boxing__jab');
  const analyzeBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기')));
  check('[Regression] Pose-analysis button still present (boxing__jab, known-supported)', analyzeBtn);

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
