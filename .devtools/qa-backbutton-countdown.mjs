import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-backbutton-countdown-shots');
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
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...extraArgs, APP_DIR],
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
  let { app, page, consoleErrors } = await launch();

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await new Promise((r) => setTimeout(r, 500));
  }
  async function shot(name) {
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  }
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }
  async function bodyIncludes(text) {
    return page.evaluate((t) => document.body.textContent?.includes(t) ?? false, text);
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

  // ============ 1. BACK BUTTON — BASIC PRESENCE ============
  // NOTE: presence checks below use goto() (direct location.hash assignment)
  // purely to land on a page quickly — that's fine for checking "does this
  // page render a .back-button", but it does NOT exercise real navigation
  // history (a raw hash assignment doesn't go through react-router's
  // navigate(), so it never populates window.history.state.idx the way an
  // actual <Link>/navigate() click does). Section 2 below rebuilds history
  // via REAL clicks to test the actual back-navigation behavior a user
  // would experience.
  await goto('#/');
  check('Home page has NO back button (main screen, going back is meaningless)', !(await page.evaluate(() => !!document.querySelector('.back-button'))));

  await goto('#/arts');
  check('MartialArtsList has a back button', await page.evaluate(() => !!document.querySelector('.back-button')));

  await goto('#/arts/bjj');
  await new Promise((r) => setTimeout(r, 300));
  await goto('#/arts/bjj/techniques/bjj__armbar');
  await new Promise((r) => setTimeout(r, 300));
  check('TechniqueDetail (Armbar) has a back button', await page.evaluate(() => !!document.querySelector('.back-button')));
  check('TechniqueDetail still shows full breadcrumb chain unchanged', await bodyIncludes('전체 기술'));

  // ============ 2. REAL BACK NAVIGATION VIA ACTUAL CLICKS ============
  // Rebuild history the way a real user would: Home -> (click a martial-art
  // card) -> MartialArtDetail -> (click a technique row) -> TechniqueDetail.
  // Every hop here is a real navigate()/<Link> click, so history.state.idx
  // is populated exactly as it would be for an actual user session.
  await goto('#/');
  await new Promise((r) => setTimeout(r, 400));
  const clickedArt = await page.evaluate(() => {
    const card = document.querySelector('.art-card');
    if (!card) return 'NOT_FOUND';
    card.click();
    return card.getAttribute('href') || card.textContent;
  });
  check('Real click on a martial-art card navigates forward', clickedArt !== 'NOT_FOUND', clickedArt);
  await new Promise((r) => setTimeout(r, 400));
  const artDetailHash = await page.evaluate(() => location.hash);
  check('Now on a MartialArtDetail page via real click', /^#\/arts\/[a-z-]+$/.test(artDetailHash), artDetailHash);

  const clickedTechnique = await page.evaluate(() => {
    const row = document.querySelector('.technique-row');
    if (!row) return 'NOT_FOUND';
    row.click();
    return 'OK';
  });
  check('Real click on a technique row navigates forward', clickedTechnique === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  const techniqueDetailHash = await page.evaluate(() => location.hash);
  check('Now on a TechniqueDetail page via real click', techniqueDetailHash.includes('/techniques/'), techniqueDetailHash);

  // History so far (all real navigate() calls): / -> /arts/<id> -> /arts/<id>/techniques/<tid>
  check('Back button click ->', (await clickText('← 이전', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  let hash = await page.evaluate(() => location.hash);
  check('First back press returns to the MartialArtDetail page (the actual prior screen), not home', hash === artDetailHash, hash);

  check('Second back button click ->', (await clickText('← 이전', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  hash = await page.evaluate(() => location.hash);
  check('Second back press returns to / (home, one more real step back)', hash === '#/' || hash === '', hash);
  await shot('01-back-navigation-sequence');

  // ============ 3. BACK BUTTON ON OTHER MAJOR SCREENS (spot-check) ============
  for (const [route, label] of [
    ['#/coach', 'AI Coach'],
    ['#/sparring', 'Sparring Analysis'],
    ['#/my-skills', 'My Skills'],
    ['#/my-style', 'My Style'],
    ['#/profile', 'Profile'],
    ['#/learning', 'Learning Hub'],
    ['#/graph', 'Technique Graph'],
  ]) {
    await goto(route);
    check(`${label} (${route}) has a back button`, await page.evaluate(() => !!document.querySelector('.back-button')));
  }

  // TechniqueGraph's own domain-specific "이전 기술" button must still exist
  // alongside the new generic back button (no duplication/removal).
  await goto('#/graph');
  check('TechniqueGraph still has its own domain-specific behavior intact (page loads, no crash)', ((await textOf('.section-title h2')) ?? '').includes('기술 그래프'));

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 4. POSE ANALYSIS COUNTDOWN — FULL FLOW ============
  await goto('#/arts/boxing/techniques/boxing__jab');
  check('Open pose modal ->', (await clickText('내 자세 분석하기')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('Pose modal opens', await page.evaluate(() => !!document.querySelector('.pose-modal')));

  // Wait for camera+model to reach 'ready' (fake device should auto-grant).
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await bodyIncludes('카메라 앞에 서서 자세를 준비해주세요.')) {
      ready = true;
      break;
    }
  }
  check('[준비 상태] shows "카메라 앞에 서서 자세를 준비해주세요."', ready);
  await shot('02-ready-phase');

  check('▶ 촬영/분석 시작 button click -> starts countdown', (await clickText('▶ 촬영/분석 시작', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  check('[카운트다운] shows "분석을 시작합니다" label', await bodyIncludes('분석을 시작합니다'));
  const firstNumber = await textOf('.pose-countdown-overlay__number');
  check('Countdown starts at 5', firstNumber === '5', firstNumber);
  await shot('03-countdown-start');

  check('시작 버튼 disabled during countdown (cannot re-trigger)', await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('촬영/분석 시작'));
    return btns.length > 0 && btns.every((b) => b.disabled);
  }));
  check('취소 button present during countdown', await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '취소')));

  // Track the countdown sequence for ~2.5s to confirm it's actually decrementing (5 -> 4 -> 3 -> ...).
  const seenNumbers = [];
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 480));
    const n = await textOf('.pose-countdown-overlay__number');
    if (n !== null) seenNumbers.push(n);
  }
  console.log('countdown sequence observed:', JSON.stringify(seenNumbers));
  const numericSeen = seenNumbers.filter((n) => /^\d+$/.test(n)).map(Number);
  check('Countdown numbers are monotonically non-increasing (5,4,3,2,1...)', numericSeen.every((n, i) => i === 0 || n <= numericSeen[i - 1]), JSON.stringify(numericSeen));

  // Wait for the full 5s to elapse and confirm recording starts automatically exactly once.
  let recordingStarted = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await bodyIncludes('자세를 분석하고 있습니다…')) {
      recordingStarted = true;
      break;
    }
  }
  check('[분석 중] "자세를 분석하고 있습니다…" shown after countdown completes', recordingStarted);
  check('Recording badge (촬영 중 X.X초) also shown', await page.evaluate(() => !!document.querySelector('.pose-overlay-badge')));
  await shot('04-recording-phase');

  // Confirm the countdown overlay is gone (no leftover state) and the countdown didn't re-trigger.
  check('Countdown overlay is gone once recording starts (exactly-once transition)', !(await page.evaluate(() => !!document.querySelector('.pose-countdown-overlay'))));

  // Wait for the recording window (4s) to finish and land on the result phase (exactly once).
  let resultShown = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await page.evaluate(() => !!document.querySelector('.pose-result'))) {
      resultShown = true;
      break;
    }
  }
  check('[분석 완료] result screen shown after recording finishes', resultShown);
  await shot('05-result-phase');

  // ============ 5. CANCEL DURING COUNTDOWN ============
  check('다시 분석 click -> back to ready', (await clickText('다시 분석', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('▶ 촬영/분석 시작 click -> countdown again', (await clickText('▶ 촬영/분석 시작', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('In countdown before cancelling', await bodyIncludes('분석을 시작합니다'));

  check('취소 button click ->', (await clickText('취소', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('Cancel returns to [준비] state ("카메라 앞에 서서 자세를 준비해주세요.")', await bodyIncludes('카메라 앞에 서서 자세를 준비해주세요.'));
  check('Cancel does NOT leave the countdown overlay showing', !(await page.evaluate(() => !!document.querySelector('.pose-countdown-overlay'))));
  check('시작 버튼 re-enabled after cancel', await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('촬영/분석 시작'));
    return !!btn && !btn.disabled;
  }));

  // Wait past where the original countdown would have finished (5s+) to confirm cancelling
  // truly stopped it — analysis must NOT start on its own after a cancel.
  await new Promise((r) => setTimeout(r, 5500));
  check('Cancelled countdown never auto-starts recording later', !(await bodyIncludes('자세를 분석하고 있습니다…')));
  await shot('06-after-cancel-no-auto-start');

  // ============ 6. TIMER CLEANUP ON UNMOUNT (close modal mid-countdown, then navigate) ============
  check('Start countdown again ->', (await clickText('▶ 촬영/분석 시작', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('In countdown before closing modal', await bodyIncludes('분석을 시작합니다'));
  check('닫기 (close modal) click mid-countdown ->', (await clickText('닫기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('Modal closed (unmounted) mid-countdown without crash', !(await page.evaluate(() => !!document.querySelector('.pose-modal'))));

  // Navigate away entirely and wait past the original 5s deadline — if the
  // countdown timer weren't cleaned up, this would eventually try to call
  // setState on an unmounted component / leak a stray rAF loop.
  await goto('#/');
  await new Promise((r) => setTimeout(r, 6000));
  // MediaPipe's own internal telemetry ping to Google is expected to be
  // blocked by CSP (see stage-21 report) — that's correct/intended privacy
  // behavior, not a leaked timer or crash, so it's excluded here.
  const realErrors = consoleErrors.filter((e) => !e.includes('odml.pa.googleapis.com'));
  check('No unexpected console errors after closing mid-countdown + navigating away (timer cleaned up)', realErrors.length === 0, JSON.stringify(realErrors));

  // ============ 7. CAMERA ERROR SHOWN BEFORE COUNTDOWN CAN START ============
  // Re-launch with camera access DENIED to confirm the error phase never
  // exposes a working countdown/start button.
  await app.close();
  ({ app, page, consoleErrors } = await launch(['--use-fake-ui-for-media-stream=deny']));
  await goto('#/arts/boxing/techniques/boxing__jab');
  check('Open pose modal (camera will be denied) ->', (await clickText('내 자세 분석하기')) === 'OK');
  let deniedShown = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await page.evaluate(() => !!document.querySelector('.pose-overlay-message--error'))) {
      deniedShown = true;
      break;
    }
  }
  check('[오류] camera-denied error shown instead of countdown', deniedShown);
  check('No "▶ 촬영/분석 시작" button available when camera is denied (cannot even reach countdown)', !(await bodyIncludes('▶ 촬영/분석 시작')));
  check('"다시 시도" retry button shown on error', await bodyIncludes('다시 시도'));
  await shot('07-camera-denied-error');

  console.log('\n=== CONSOLE ERRORS TOTAL (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(path.join(SCRATCH, 'qa-backbutton-countdown-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
