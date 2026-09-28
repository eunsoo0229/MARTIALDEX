import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

// Hits the REAL, live Supabase project configured in .env (same pattern as
// qa-gym-supabase-live.mjs) — creates real throwaway QA-tagged accounts, real
// rows in nutrition_profiles/nutrition_meals (migration 0021), and verifies
// cross-device restore + RLS isolation via direct REST. No live Gemini calls
// are made here — this test is only about Supabase storage/sync, not AI.

const STAMP = Date.now();
const USER_A = { email: `mdx.qa.nutrition.a.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA영양A' };
const USER_B = { email: `mdx.qa.nutrition.b.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA영양B' };

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
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith('http://localhost:5173'));
    if (!page) await sleep(300);
  }
  if (!page) page = await app.firstWindow();
  await page.waitForLoadState('load');
  await sleep(1000);
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function goto(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(500);
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

  // ============ 2. 목표 설정 화면(실제 UI)에서 감량 목표 저장 ============
  await goto(page, '#/nutrition/goals');
  await page.evaluate(() => {
    [...document.querySelectorAll('button.chip')].find((b) => b.textContent.trim() === '감량')?.click();
  });
  const calorieInput = await page.$('label.field-label:has-text("목표 칼로리") input');
  await calorieInput.fill('2100');
  await calorieInput.press('Tab');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '저장')?.click();
  });
  await sleep(500);
  const bodyAfterGoalSave = await page.evaluate(() => document.body.innerText);
  check('[2] 목표 설정 실제 UI로 저장 (감량, 2,100kcal)', bodyAfterGoalSave.includes('2,100kcal'), '');

  // ============ 3. 목표 저장 직후, 별도 새로고침 없이 Supabase에 자동 반영 ============
  await sleep(2500);
  const accessToken = await getAccessToken(page);
  let profileSupabaseCheck = null;
  if (SUPABASE_URL && accessToken) {
    profileSupabaseCheck = await restQuery(page, SUPABASE_URL, apikey, 'nutrition_profiles', 'select=data,updated_at', accessToken);
  }
  check(
    '[3] 목표 저장 직후 nutrition_profiles 테이블에 자동 반영됨 (디바운스된 이벤트 기반 동기화)',
    profileSupabaseCheck?.status === 200 &&
      Array.isArray(profileSupabaseCheck.body) &&
      profileSupabaseCheck.body.length === 1 &&
      profileSupabaseCheck.body[0].data?.calorieGoal === 2100,
    JSON.stringify(profileSupabaseCheck).slice(0, 300)
  );

  // ============ 4. 식사 직접 입력(실제 UI) ============
  await goto(page, '#/nutrition');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ 직접 입력'))?.click();
  });
  await sleep(300);
  await page.fill('.modal-panel input[placeholder="음식 이름"]', 'QA 라이브 식사');
  await page.fill('.modal-panel input[placeholder="섭취량"]', '1인분');
  const numberInputs = await page.$$('.modal-panel .gym-num-input');
  await numberInputs[0].fill('500');
  await numberInputs[0].press('Tab');
  await page.evaluate(() => {
    [...document.querySelectorAll('.modal-panel button')].find((b) => b.textContent.trim() === '저장')?.click();
  });
  await sleep(500);
  const bodyAfterMealSave = await page.evaluate(() => document.body.innerText);
  check('[4] 식사 직접 입력 실제 UI로 저장', bodyAfterMealSave.includes('QA 라이브 식사'), '');

  // ============ 5. 식사 저장 직후 Supabase에 자동 반영 ============
  await sleep(2500);
  let mealSupabaseCheck = null;
  if (SUPABASE_URL && accessToken) {
    mealSupabaseCheck = await restQuery(page, SUPABASE_URL, apikey, 'nutrition_meals', 'select=id,data&order=created_at.desc&limit=1', accessToken);
  }
  check(
    '[5] 저장한 식사가 nutrition_meals 테이블에 실제로 저장됨 (마이그레이션 0021 실적용 확인)',
    mealSupabaseCheck?.status === 200 &&
      Array.isArray(mealSupabaseCheck.body) &&
      mealSupabaseCheck.body.length === 1 &&
      mealSupabaseCheck.body[0].data?.foods?.[0]?.name === 'QA 라이브 식사',
    JSON.stringify(mealSupabaseCheck).slice(0, 400)
  );

  // ============ 6. 앱 재시작 후에도 로그인/데이터 유지 (다른 기기 로그인 시뮬레이션) ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  const stillLoggedIn = await page.evaluate(() => [...document.querySelectorAll('.icon-btn, a.icon-btn')].some((b) => b.title === '로그아웃'));
  check('[6] 앱 재시작 후에도 로그인 유지', stillLoggedIn);
  await goto(page, '#/nutrition');
  const bodyAfterRestart = await page.evaluate(() => document.body.innerText);
  check('[6b] 앱 재시작 후 목표/식사 기록이 Supabase에서 복원됨', bodyAfterRestart.includes('2,100kcal') && bodyAfterRestart.includes('QA 라이브 식사'), bodyAfterRestart.slice(0, 400));

  // ============ 7. 두 번째 계정으로는 첫 번째 계정의 데이터가 보이지 않아야 함(RLS) ============
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.title === '로그아웃');
    btn?.click();
  });
  await sleep(800);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(800);
  await fillSignup(page, USER_B);
  const accessTokenB = await getAccessToken(page);
  check('[7] 두 번째 실제 계정 회원가입 성공', !!accessTokenB);

  if (SUPABASE_URL && accessTokenB) {
    const crossMeals = await restQuery(page, SUPABASE_URL, apikey, 'nutrition_meals', 'select=id', accessTokenB);
    check(
      '[7a] RLS: 사용자 B가 사용자 A의 nutrition_meals를 조회하면 빈 배열(접근 차단)',
      crossMeals.status === 200 && Array.isArray(crossMeals.body) && crossMeals.body.length === 0,
      JSON.stringify(crossMeals)
    );
    // nutrition_profiles is a singleton-per-user table (unlike nutrition_meals'
    // list shape) — user B gets their OWN default row (goalType:'maintain',
    // calorieGoal:null) synced up on login, so an empty array is NOT the right
    // expectation here. The real RLS check is that B's row is never A's data
    // (goalType:'lose', calorieGoal:2100).
    const crossProfile = await restQuery(page, SUPABASE_URL, apikey, 'nutrition_profiles', 'select=data', accessTokenB);
    check(
      "[7b] RLS: 사용자 B의 nutrition_profiles 조회는 자기 자신의 기본 프로필만 반환, 사용자 A의 감량 목표(2,100kcal) 아님",
      crossProfile.status === 200 &&
        Array.isArray(crossProfile.body) &&
        crossProfile.body.length === 1 &&
        crossProfile.body[0].data?.calorieGoal !== 2100 &&
        crossProfile.body[0].data?.goalType !== 'lose',
      JSON.stringify(crossProfile)
    );
  }

  await goto(page, '#/nutrition');
  const bodyForUserB = await page.evaluate(() => document.body.innerText);
  check('[7c][UI] 사용자 B 화면에는 사용자 A의 식사가 보이지 않음', !bodyForUserB.includes('QA 라이브 식사'), '');

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
