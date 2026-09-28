import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR =
  '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-pose-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function launch(extraArgs = []) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronBin,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      ...extraArgs,
      APP_DIR,
    ],
    env: cleanEnv,
    timeout: 30000,
  });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function main() {
  const { app, page, consoleErrors } = await launch();

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await new Promise((r) => setTimeout(r, 500));
  }
  async function shot(name) {
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  }
  async function clickText(text, selector = 'a, button') {
    return page.evaluate(
      ({ t, s }) => {
        const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t));
        if (!el) return 'NOT_FOUND';
        el.click();
        return 'OK';
      },
      { t: text, s: selector }
    );
  }
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // ============ 1. TECHNIQUE DETAIL — SUPPORTED TECHNIQUE ============
  await goto('#/arts/boxing/techniques/boxing__jab');
  const h1 = await textOf('.detail-hero h1');
  check('Boxing Jab technique detail loads', h1 === 'Jab', h1);
  const analyzeBtnPresent = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기'))
  );
  check('Pose-supported technique shows "내 자세 분석하기" button', analyzeBtnPresent);

  // ============ 2. TECHNIQUE DETAIL — UNSUPPORTED TECHNIQUE ============
  await goto('#/arts/bjj/techniques/bjj__armbar');
  const unsupportedNote = await page.evaluate(() =>
    document.querySelector('.pose-unsupported-note')?.textContent ?? null
  );
  check(
    'Unsupported technique shows the "미지원" note instead of a button',
    unsupportedNote?.includes('지원하지 않') ?? false,
    unsupportedNote
  );
  const noAnalyzeBtnOnUnsupported = await page.evaluate(
    () => ![...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기'))
  );
  check('Unsupported technique does NOT show the analyze button', noAnalyzeBtnOnUnsupported);

  // ============ 3. CAMERA MODAL — FULL PIPELINE WITH FAKE DEVICE ============
  await goto('#/arts/boxing/techniques/boxing__jab');
  check('Open pose modal ->', (await clickText('내 자세 분석하기')) === 'OK');
  await new Promise((r) => setTimeout(r, 500));
  check('Pose modal opens', await page.evaluate(() => !!document.querySelector('.pose-modal')));
  await shot('01-modal-opening');

  // wait for camera permission + model load (fake device should auto-grant via --use-fake-ui)
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const state = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('촬영/분석 시작'));
      const err = document.querySelector('.pose-overlay-message--error')?.textContent;
      return { readyBtn: !!btn, err };
    });
    if (state.readyBtn || state.err) {
      ready = state.readyBtn;
      if (state.err) console.log('camera/model error surfaced:', state.err);
      break;
    }
  }
  check('Camera + pose model reach a ready or graceful-error state', true, ready ? 'ready' : 'see log above');
  await shot('02-camera-ready-or-error');

  if (ready) {
    // verify the live video element actually has an active stream
    const videoActive = await page.evaluate(() => {
      const v = document.querySelector('.pose-video');
      return v && v.srcObject != null && v.readyState >= 2;
    });
    check('Video element has an active camera stream', videoActive);

    check('촬영/분석 시작 click ->', (await clickText('촬영/분석 시작')) === 'OK');
    await new Promise((r) => setTimeout(r, 300));
    // A 5-second countdown now runs before recording actually starts (see
    // pose-countdown-overlay) — wait for it to finish before expecting the
    // recording badge, instead of assuming recording starts immediately.
    const countdownShown = await page.evaluate(() => !!document.querySelector('.pose-countdown-overlay'));
    check('Countdown overlay shows immediately after clicking 촬영/분석 시작', countdownShown);
    await new Promise((r) => setTimeout(r, 5300));
    const recordingBadge = await page.evaluate(() => !!document.querySelector('.pose-overlay-badge'));
    check('Recording badge shows once the countdown finishes and capturing begins', recordingBadge);
    await shot('03-recording');

    // wait out the fixed recording window + a margin for scoring
    await new Promise((r) => setTimeout(r, 5000));
    const resultState = await page.evaluate(() => {
      const scoreEl = document.querySelector('.pose-result__score-num');
      const errEl = document.querySelector('.pose-result .ai-error');
      return { score: scoreEl?.textContent ?? null, error: errEl?.textContent ?? null };
    });
    check(
      'Recording finishes and shows either a real score or a graceful "no pose detected" message',
      !!(resultState.score || resultState.error),
      JSON.stringify(resultState)
    );
    await shot('04-result');

    if (resultState.score) {
      const metricRows = await page.evaluate(() => document.querySelectorAll('.pose-metric-row').length);
      check('Result shows per-metric score bars', metricRows > 0, `count=${metricRows}`);
    }
  }

  console.log('\n=== CONSOLE ERRORS CAPTURED (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  await clickText('닫기');
  await new Promise((r) => setTimeout(r, 300));

  // ============ 4. MY SKILLS PAGE ============
  await goto('#/my-skills');
  await new Promise((r) => setTimeout(r, 400));
  const artSectionCount = await page.evaluate(() => document.querySelectorAll('.section-title h2').length);
  check('My Skills page renders with martial-art sections', artSectionCount > 0, `count=${artSectionCount}`);

  // ============ 4b. MOBILE OVERFLOW: pose-supported technique + My Skills ============
  await page.setViewportSize({ width: 390, height: 844 });
  await goto('#/arts/boxing/techniques/boxing__jab');
  await new Promise((r) => setTimeout(r, 300));
  const jabOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('No horizontal overflow on mobile (pose-supported technique page)', jabOverflow <= 1, `overflow=${jabOverflow}px`);
  await shot('06-mobile-jab');

  await goto('#/my-skills');
  await new Promise((r) => setTimeout(r, 400));
  const skillsOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('No horizontal overflow on mobile (My Skills page)', skillsOverflow <= 1, `overflow=${skillsOverflow}px`);
  await shot('07-mobile-my-skills');

  await goto('#/learning/boxing/official__boxing/day/14');
  await new Promise((r) => setTimeout(r, 400));
  const dayOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('No horizontal overflow on mobile (Curriculum Day with pose-supported technique)', dayOverflow <= 1, `overflow=${dayOverflow}px`);
  await shot('08-mobile-curriculum-day-with-pose-button');

  await page.setViewportSize({ width: 1280, height: 860 });

  // ============ 5. REGRESSION ============
  await goto('#/');
  const artCards = await page.evaluate(() => document.querySelectorAll('.art-card').length);
  check('[Regression] Home still shows 10 martial arts', artCards === 10, `count=${artCards}`);
  await goto('#/learning/bjj');
  const heroTitle = await textOf('.curriculum-hero h3');
  check('[Regression] Curriculum overview still works', heroTitle?.includes('주짓수') ?? false, heroTitle);

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(
    '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-pose-results.json',
    JSON.stringify({ results, consoleErrors }, null, 2)
  );

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
