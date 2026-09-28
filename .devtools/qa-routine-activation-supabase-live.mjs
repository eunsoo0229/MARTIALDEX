import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

// Focused live-Supabase check for the NEW 훈련 루틴 관리 toggle screen: does
// activating/deactivating a routine through the real UI actually propagate
// to another "device" (a second app instance under the same account)? The
// underlying write path (gymRoutineRepository.save(), bumping updatedAt) is
// identical to every other gym-routine mutation already covered by
// qa-gym-supabase-live.mjs — this test only adds the toggle-screen-specific
// activate -> deactivate -> cross-device-restore sequence on top of that
// already-proven mechanism.

const STAMP = Date.now();
const USER_A = { email: `mdx.qa.routineact.a.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA루틴A' };

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

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(800);

  await fillSignup(page, USER_A);
  const token = await getAccessToken(page);
  check('[1] 실제 Supabase 회원가입 및 로그인 성공', !!token);

  // Seed a routine with an exercise, then activate it via the real 훈련 루틴 관리 UI.
  const seeded = await page.evaluate(async () => {
    const { createGymRoutine, addExerciseToDay } = await import('/src/lib/gymRoutine/service.ts');
    const { getKstWeekday } = await import('/src/lib/dateUtil.ts');
    let r = createGymRoutine('QA 라이브 활성화 루틴');
    r = addExerciseToDay(r, getKstWeekday(), {
      techniqueId: 'gym-벤치프레스',
      targetSets: 3,
      targetReps: [10, 10, 10],
      targetSeconds: null,
      targetWeightKg: 60,
      restSeconds: 90,
    });
    return { id: r.id };
  });
  check('[2] 테스트 루틴 시드됨', !!seeded.id);

  await goto(page, '#/training/routines/manage');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('QA 라이브 활성화 루틴'));
    row.querySelector('.routine-toggle').click();
  });
  await sleep(500);
  const bodyAfterActivate = await page.evaluate(() => document.body.innerText);
  check('[3] 실제 UI로 루틴 활성화 (활성 루틴 1개)', bodyAfterActivate.includes('활성 루틴 1개'), '');

  // Activation should push to Supabase within the debounce window.
  await sleep(2500);
  let cloudCheck = null;
  if (SUPABASE_URL && token) {
    cloudCheck = await restQuery(page, SUPABASE_URL, apikey, 'gym_routines', `select=id,active&id=eq.${seeded.id}`, token);
  }
  check(
    '[4] 활성화가 Supabase gym_routines.active=true로 즉시 반영됨',
    cloudCheck?.status === 200 && cloudCheck.body?.[0]?.active === true,
    JSON.stringify(cloudCheck)
  );

  // Deactivate via the toggle screen — must NOT delete the routine, just flip active to false.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('QA 라이브 활성화 루틴'));
    row.querySelector('.routine-toggle').click();
  });
  await sleep(2500);
  let cloudCheckOff = null;
  if (SUPABASE_URL && token) {
    cloudCheckOff = await restQuery(page, SUPABASE_URL, apikey, 'gym_routines', `select=id,active,data&id=eq.${seeded.id}`, token);
  }
  check(
    '[5] 비활성화가 Supabase에 반영되고 운동 데이터는 그대로 보존됨',
    cloudCheckOff?.status === 200 &&
      cloudCheckOff.body?.[0]?.active === false &&
      cloudCheckOff.body?.[0]?.data?.days?.some((d) => d.exercises?.some((e) => e.techniqueId === 'gym-벤치프레스')),
    JSON.stringify(cloudCheckOff).slice(0, 400)
  );

  // Reactivate, then simulate "another device": fresh app instance, same account, no local data.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('QA 라이브 활성화 루틴'));
    row.querySelector('.routine-toggle').click();
  });
  await sleep(2500);

  await app.close();
  ({ app, page, consoleErrors } = await launch());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(800);
  await goto(page, '#/login');
  await page.fill('form input[type="email"]', USER_A.email);
  await page.fill('form input[type="password"]', USER_A.password);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => (await page.evaluate(() => location.hash)) !== '#/login');
  await sleep(1500);

  await goto(page, '#/training/routines/manage');
  const bodyOnOtherDevice = await page.evaluate(() => document.body.innerText);
  check(
    '[6] 다른 기기(새 로컬 데이터)에서 로그인 시 활성 루틴 상태가 그대로 복원됨',
    bodyOnOtherDevice.includes('QA 라이브 활성화 루틴') && bodyOnOtherDevice.includes('활성 루틴 1개'),
    bodyOnOtherDevice.slice(0, 400)
  );

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors.slice(0, 5)));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  console.log('\nTest account created (delete from Supabase Dashboard afterward if desired):', USER_A.email);

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
