import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-posture-jks-shots';
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

  const judoSamples = [
    'judo__shizen-hontai', 'judo__kumi-kata',        // J1 basics/grip
    'judo__osoto-gari', 'judo__seoi-nage',            // J2 ashi/te waza
    'judo__uchi-mata', 'judo__ura-nage',              // J3 koshi/ma-sutemi
    'judo__uchi-mata-makikomi', 'judo__ouchi-gari-uchi-mata', // J4 yoko-sutemi/renraku
    'judo__juji-gatame', 'judo__mount',               // J5 kansetsu/newaza
    'judo__hip-escape', 'judo__hadaka-jime',          // J6 escape/shime
  ];
  const kickboxingSamples = [
    'kickboxing__orthodox',                            // K1 stance
    'kickboxing__jab',                                 // K2 punch
    'kickboxing__round-kick', 'kickboxing__straight-knee', // K3 kick/knee
    'kickboxing__double-collar-tie',                   // K4 clinch
    'kickboxing__parry', 'kickboxing__cross-counter',  // K5 defense/counter
    'kickboxing__jab-cross-low-kick',                  // K6 combination
  ];
  const samboSamples = [
    'sambo__스탠스',                                     // S1 stance
    'sambo__отхват',                                    // S2 leg technique
    'sambo__мельница',                                  // S3 shoulder throw
    'sambo__удержание-сбоку',                           // S5 top position
    'sambo__рычаг-локтя',                               // S6 joint lock
    'sambo__jab-cross-hook-uppercut',                   // S7 combat sambo striking
  ];

  for (const [art, samples] of [['judo', judoSamples], ['kickboxing', kickboxingSamples], ['sambo', samboSamples]]) {
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

  // Confirm prior-session data (BJJ/Boxing/Wrestling) untouched
  await goto('#/arts/bjj/techniques/bjj__armbar');
  const armbarStep1 = await textOf('.posture-steps li');
  check('[bjj__armbar] pre-existing posture data untouched', (armbarStep1 ?? '').includes('클로즈드 가드에서 상대의 한쪽 팔을'), armbarStep1);

  await goto('#/arts/boxing/techniques/boxing__jab');
  const jabOverview = await overviewOf();
  check('[boxing__jab] pre-existing posture data untouched', !!jabOverview && jabOverview.length > 5, jabOverview);

  await goto('#/arts/wrestling/techniques/wrestling__front-headlock');
  const wrestlingOverview = await overviewOf();
  check('[wrestling__front-headlock] pre-existing posture data untouched', !!wrestlingOverview && wrestlingOverview.length > 5, wrestlingOverview);

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
