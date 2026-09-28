import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

// Hits the REAL, live Supabase project configured in .env (same pattern as
// qa-auth-live.mjs) — creates real throwaway QA-tagged accounts, real rows
// in gym_routines/training_history, and verifies everything via direct REST
// (independent of the app's own UI claims), including cross-user RLS
// isolation. Nothing here uses the service_role key.

const STAMP = Date.now();
const USER_A = { email: `mdx.qa.gym.a.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA헬스A' };
const USER_B = { email: `mdx.qa.gym.b.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA헬스B' };

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(1000);
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function goto(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await sleep(500);
}
async function bodyIncludes(page, text) {
  return page.evaluate((t) => document.body.textContent?.includes(t) ?? false, text);
}
async function waitUntil(conditionFn, timeoutMs = 12000, stepMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return true;
    await sleep(stepMs);
  }
  return false;
}

async function fillSignup(page, user) {
  await goto(page, '#/signup');
  await page.fill('form input[type="email"]', user.email);
  const passwordInputs = await page.$$('form input[type="password"]');
  await passwordInputs[0].fill(user.password);
  await passwordInputs[1].fill(user.password);
  await page.fill('form input[type="text"]', user.nickname);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => {
    const hash = await page.evaluate(() => location.hash);
    if (hash !== '#/signup') return true;
    return page.evaluate(() => document.querySelector('.ai-inline-warning') !== null);
  });
  await sleep(500);
}

async function fillLogin(page, email, password) {
  await goto(page, '#/login');
  await page.fill('form input[type="email"]', email);
  await page.fill('form input[type="password"]', password);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => {
    const hash = await page.evaluate(() => location.hash);
    if (hash !== '#/login') return true;
    return page.evaluate(() => document.querySelector('.ai-inline-warning') !== null);
  });
  await sleep(500);
}

async function getAccessToken(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key)).access_token ?? null;
    } catch {
      return null;
    }
  });
}

async function restQuery(page, url, apikey, table, query, accessToken) {
  return page.evaluate(
    async ({ url, apikey, table, query, accessToken }) => {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
        headers: { apikey, Authorization: `Bearer ${accessToken || apikey}` },
      });
      const status = res.status;
      const body = await res.json().catch(() => null);
      return { status, body };
    },
    { url, apikey, table, query, accessToken }
  );
}

function readEnvVar(name) {
  const envText = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8');
  const line = envText.split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

async function main() {
  let { app, page, consoleErrors } = await launch();
  const SUPABASE_URL = readEnvVar('VITE_SUPABASE_URL');
  const apikey = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
  check('Supabase URL/키 확인', !!SUPABASE_URL && !!apikey, `url=${SUPABASE_URL}`);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(800);

  // ============ 1. 실제 로그인(회원가입) ============
  await fillSignup(page, USER_A);
  const tokenA1 = await getAccessToken(page);
  check('[1] 실제 Supabase 회원가입 및 로그인 성공', !!tokenA1);

  // ============ 2. 자유훈련에서 헬스 운동 세트 기록 (실제 UI) ============
  await goto(page, '#/free-training');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('헬스 운동 선택'))?.click(); });
  await sleep(300);
  await page.fill('input[placeholder="운동 이름으로 검색"]', '벤치프레스');
  await sleep(400);
  await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('.technique-row__name'));
    names.find((el) => el.textContent === '벤치프레스')?.closest('button')?.click();
  });
  await sleep(300);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('훈련 시작'))?.click(); });
  await sleep(500);

  async function fillGymSet(weight, reps) {
    await (await page.$('label.field-label:has-text("중량") input')).fill(String(weight));
    await (await page.$('label.field-label:has-text("반복") input')).fill(String(reps));
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '세트 완료')?.click(); });
    await sleep(400);
    const skipBtn = await page.$('button:has-text("건너뛰기")');
    if (skipBtn) { await skipBtn.click(); await sleep(300); }
  }
  await fillGymSet(60, 10);
  await fillGymSet(60, 10);
  await fillGymSet(60, 8);
  await sleep(500);
  const bodyAfterFinish = await page.evaluate(() => document.body.innerText);
  check('[2] 자유훈련에서 벤치프레스 3세트 실제 UI로 완료', bodyAfterFinish.includes('자유훈련 완료') || bodyAfterFinish.includes('수행 기술'), '');

  // ============ 3. 방금 기록한 세션이 "로그인된 상태에서 기록 직후" 자동으로 Supabase에 올라가는지 확인 ============
  // (This is the exact gap the user's request warns about — verifying, not assuming.
  // Fixed via a debounced listener in LocalDataMigrationPrompt.tsx — wait past the 800ms debounce + real network round-trip.)
  await sleep(2500);
  const accessToken = await getAccessToken(page);
  let immediateCheck = null;
  if (SUPABASE_URL && accessToken) {
    immediateCheck = await restQuery(page, SUPABASE_URL, apikey, 'training_history', 'select=id,data&order=created_at.desc&limit=1', accessToken);
  }
  check(
    '[3] 로그인된 상태에서 기록 직후, 별도 새로고침 없이 Supabase에 자동 반영됨 (디바운스된 이벤트 기반 동기화)',
    immediateCheck?.status === 200 && Array.isArray(immediateCheck.body) && immediateCheck.body.length > 0,
    JSON.stringify(immediateCheck).slice(0, 300)
  );

  // ============ 4. 요일별 루틴 생성 (실제 UI) 및 Supabase 즉시 반영 확인 ============
  await goto(page, '#/training/routines');
  await page.fill('input[placeholder="예: 5분할 루틴"]', 'QA 라이브 루틴');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ 루틴 만들기'))?.click(); });
  await sleep(500);
  const routineBodyText = await page.evaluate(() => document.body.innerText);
  check('[4] 요일별 루틴 실제 UI로 생성됨', routineBodyText.includes('QA 라이브 루틴'), '');

  await sleep(2500);
  let routineSupabaseCheck = null;
  if (SUPABASE_URL && accessToken) {
    routineSupabaseCheck = await restQuery(page, SUPABASE_URL, apikey, 'gym_routines', `select=id,name&name=eq.${encodeURIComponent('QA 라이브 루틴')}`, accessToken);
  }
  check(
    '[4b] 생성한 루틴이 Supabase gym_routines 테이블에 실제로 저장됨 (마이그레이션 0020 실적용 확인)',
    routineSupabaseCheck?.status === 200 && Array.isArray(routineSupabaseCheck.body) && routineSupabaseCheck.body.length === 1,
    JSON.stringify(routineSupabaseCheck)
  );

  // ============ 5. 앱 재시작 후에도 로그인/데이터 유지 ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  const stillLoggedIn = await page.evaluate(() => [...document.querySelectorAll('.icon-btn, a.icon-btn')].some((b) => b.title === '로그아웃'));
  check('[5] 앱 재시작 후에도 로그인 유지', stillLoggedIn);
  await goto(page, '#/training/routines');
  const bodyAfterRestart = await page.evaluate(() => document.body.innerText);
  check('[5b] 앱 재시작 후 루틴이 Supabase에서 복원됨', bodyAfterRestart.includes('QA 라이브 루틴'), '');

  // ============ 6. 두 번째 계정으로는 첫 번째 계정의 데이터가 보이지 않아야 함(RLS) ============
  await page.evaluate(() => { const btn = [...document.querySelectorAll('button')].find((b) => b.title === '로그아웃'); btn?.click(); });
  await sleep(800);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(800);
  await fillSignup(page, USER_B);
  const accessTokenB = await getAccessToken(page);
  check('[6] 두 번째 실제 계정 회원가입 성공', !!accessTokenB);

  if (SUPABASE_URL && accessTokenB) {
    const crossRoutine = await restQuery(page, SUPABASE_URL, apikey, 'gym_routines', `select=id&name=eq.${encodeURIComponent('QA 라이브 루틴')}`, accessTokenB);
    check(
      "[6a] RLS: 사용자 B가 사용자 A의 gym_routines를 조회하면 빈 배열(접근 차단)",
      crossRoutine.status === 200 && Array.isArray(crossRoutine.body) && crossRoutine.body.length === 0,
      JSON.stringify(crossRoutine)
    );
    const crossHistory = await restQuery(page, SUPABASE_URL, apikey, 'training_history', 'select=id&order=created_at.desc&limit=5', accessTokenB);
    check(
      "[6b] RLS: 사용자 B의 training_history 조회는 자기 자신의 행(0개)만 반환, 사용자 A의 기록 없음",
      crossHistory.status === 200 && Array.isArray(crossHistory.body) && crossHistory.body.length === 0,
      JSON.stringify(crossHistory)
    );
  }

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors.slice(0, 5)));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  console.log('\nTest accounts created (delete from Supabase Dashboard afterward if desired):');
  console.log(' -', USER_A.email);
  console.log(' -', USER_B.email);

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
