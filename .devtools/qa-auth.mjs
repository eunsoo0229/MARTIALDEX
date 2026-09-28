import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-auth-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
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

// NOTE: this stage (21) adds real Supabase Auth. Without live project
// credentials (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) supplied
// in .env, the app runs in "not configured" mode — this script verifies
// exactly and only that mode: every auth surface must degrade gracefully
// (clear message, disabled actions, zero crashes) rather than break, and
// every existing feature must keep working precisely as before. It does
// NOT exercise real signUp/signIn/session persistence/RLS — that requires
// a real project and is called out separately as pending in the final
// report, never claimed as tested here.
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
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }
  async function bodyIncludes(text) {
    return page.evaluate((t) => document.body.textContent?.includes(t) ?? false, text);
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // ============ 1. NOT CONFIGURED — LOGIN / SIGNUP / RESET PAGES ============
  await goto('#/login');
  check('Login page renders', (await textOf('.section-title h2')) === '로그인');
  check('Login shows "not configured" warning', await bodyIncludes('Supabase 설정이 되어 있지 않아'));
  check('Login submit button disabled when not configured', await page.evaluate(() => document.querySelector('button[type="submit"]')?.disabled === true));
  await shot('01-login-not-configured');

  await goto('#/signup');
  check('Signup page renders', (await textOf('.section-title h2')) === '회원가입');
  check('Signup shows "not configured" warning', await bodyIncludes('Supabase 설정이 되어 있지 않아'));
  check('Signup submit button disabled when not configured', await page.evaluate(() => document.querySelector('button[type="submit"]')?.disabled === true));

  await goto('#/reset-password');
  check('Reset-password page renders', (await textOf('.section-title h2')) === '비밀번호 재설정');
  check('Reset-password shows "not configured" warning', await bodyIncludes('Supabase 설정이 되어 있지 않아'));
  check('Reset-password submit button disabled when not configured', await page.evaluate(() => document.querySelector('button[type="submit"]')?.disabled === true));

  // ============ 2. HEADER — NO LOGIN/LOGOUT ICON WHEN NOT CONFIGURED ============
  await goto('#/');
  const headerIconTitles = await page.evaluate(() => [...document.querySelectorAll('.icon-btn, a.icon-btn')].map((b) => b.title));
  check('Header shows no login/logout icon when Supabase is not configured (no half-built auth UI)', !headerIconTitles.includes('로그인') && !headerIconTitles.includes('로그아웃'), JSON.stringify(headerIconTitles));

  // ============ 3. PROFILE PAGE — NO ACCOUNT CARD WHEN NOT CONFIGURED ============
  await goto('#/profile');
  check('Profile page still renders (level/streak/achievements from local data)', await bodyIncludes('프로필'));
  check('Profile page shows no "계정" card when Supabase not configured', !(await bodyIncludes('☁️ 계정에 백업하기')));
  await shot('02-profile-no-account-card');

  // ============ 4. LOGIN-TO-BACKUP BANNERS ABSENT WHEN NOT CONFIGURED ============
  for (const [hash, feature] of [
    ['#/learning', '내 커리큘럼'],
    ['#/my-skills', '기술 숙련도'],
    ['#/today-training', '훈련 기록'],
    ['#/sparring', '스파링 기록'],
    ['#/my-style', '나의 스타일 분석'],
  ]) {
    await goto(hash);
    check(`No login-to-backup banner on ${hash} when Supabase not configured`, !(await bodyIncludes(`로그인하면 ${feature}`)));
  }

  // ============ 5. NO CRASHES ANYWHERE — ZERO CONSOLE ERRORS SO FAR ============
  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 6. FULL REGRESSION — EVERY EXISTING FEATURE STILL WORKS ============
  await goto('#/');
  check('[Regression] Home shows 10 martial arts', (await page.evaluate(() => document.querySelectorAll('.art-card').length)) === 10);
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('Armbar', { delay: 15 });
  await new Promise((r) => setTimeout(r, 350));
  check('[Regression] Search still works', (await page.evaluate(() => document.querySelectorAll('.search-result-row').length)) > 0);
  await page.keyboard.press('Escape');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  check('[Regression] Technique detail still works', (await textOf('.detail-hero h1')) === 'Armbar');
  check('[Regression] YouTube embed still works', (await page.evaluate(() => document.querySelectorAll('.video-embed iframe').length)) > 0);

  await goto('#/techniques');
  check('[Regression] Technique list/filter still works', (await page.evaluate(() => document.querySelectorAll('.technique-row, .search-result-row').length)) > 0);

  await goto('#/learning/bjj');
  check('[Regression] Official curriculum overview still works', ((await textOf('.curriculum-hero h3')) ?? '').includes('주짓수'));

  await goto('#/fighter-style');
  check('[Regression] Fighter-style hub still works', ((await textOf('.section-title h2')) ?? '') === '선수 스타일 학습');

  await goto('#/coach');
  check('[Regression] AI Coach page still works', ((await textOf('.section-title h2')) ?? '').includes('AI 개인 코치'));

  await goto('#/sparring');
  check('[Regression] Sparring analysis hub still works', ((await textOf('.section-title h2')) ?? '').includes('스파링 분석'));

  await goto('#/graph');
  check('[Regression] Technique graph page still works', ((await textOf('.section-title h2')) ?? '').includes('기술 그래프'));

  await goto('#/situation');
  check('[Regression] Situation recommend page still works', ((await textOf('.section-title h2')) ?? '').includes('상황별 기술 추천'));

  await goto('#/stats');
  check('[Regression] My Stats page still works', !(await bodyIncludes('오류')));

  await goto('#/review');
  check('[Regression] Review page still works', (await bodyIncludes('복습')));

  await goto('#/my-style');
  check('[Regression] My Style page still works', ((await textOf('.section-title h2')) ?? '').includes('MY MARTIAL STYLE'));

  await goto('#/my-skills');
  const overallStats = await page.evaluate(() => [...document.querySelectorAll('.curriculum-stat-row strong')].map((e) => e.textContent));
  check('[Regression] My Skills dashboard still works', Number(overallStats[0]) > 1000, overallStats[0]);

  await goto('#/arts/boxing/techniques/boxing__jab');
  check('[Regression] Pose-analysis button still present on supported technique', await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('자세 분석'))));

  await goto('#/');
  check('[Regression] Header logo image renders', await page.evaluate(() => !!document.querySelector('.brand__mark[src]')));
  check('[Regression] "메뉴 ▾" nav dropdown still present', await bodyIncludes('메뉴'));

  console.log('\n=== CONSOLE ERRORS TOTAL (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(path.join(SCRATCH, 'qa-auth-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
