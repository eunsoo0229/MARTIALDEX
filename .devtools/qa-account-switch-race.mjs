// Account data isolation audit — TEST 7 (async race condition).
//
// The real-world race (LocalDataMigrationPrompt fires syncXBidirectional(A.id)
// on login; the user switches to B before it resolves; guardAccountSwitch's
// window.location.reload() does not synchronously halt JS, so A's promise
// can still resolve afterward) is a genuine millisecond-timing race against
// real network latency and Electron's navigation teardown — not reliably
// reproducible on demand by an automated script (confirmed: window.location.
// reload cannot be stubbed, it is a non-configurable host method, so trying
// to keep the JS context alive across a REAL account-switch reload to race
// it is not viable here).
//
// This test instead reproduces the exact VULNERABLE CODE PATH deterministically:
// call syncCombosBidirectional(A.id) while B is the genuinely, verifiably
// active Supabase session. This is precisely the state the real race
// produces the instant A's stale promise resumes execution after B has
// logged in (a syncX call whose closed-over userId argument no longer
// matches the live session) — the fix (isStillCurrentUser) does not care
// HOW that mismatch came about, only THAT it exists at write time, so this
// is a faithful, timing-independent test of the actual guard.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const STAMP = Date.now();
const A = { email: `mdx.qa.raceA.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA레이스A' };
const B = { email: `mdx.qa.raceB.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA레이스B' };

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function readEnvVar(name) {
  const envText = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8');
  const match = envText.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
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
  await sleep(1200);
  return { app, page };
}
async function goto(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(500);
}
async function signOutIfAny(page) {
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    await supabase?.auth.signOut().catch(() => {});
  });
  await sleep(500);
}
async function signUp(page, user) {
  await goto(page, '#/signup');
  await page.waitForSelector('form input[type="email"]', { timeout: 10000 });
  await page.fill('form input[type="email"]', user.email);
  const pw = await page.$$('form input[type="password"]');
  await pw[0].fill(user.password);
  await pw[1].fill(user.password);
  await page.fill('form input[type="text"]', user.nickname);
  await page.click('form button[type="submit"]');
  await sleep(2500);
}
async function signIn(page, user) {
  await goto(page, '#/login');
  await page.waitForSelector('form input[type="email"]', { timeout: 10000 });
  await page.fill('form input[type="email"]', user.email);
  await page.fill('form input[type="password"]', user.password);
  await page.click('form button[type="submit"]');
  await sleep(3000); // real login here may trigger guardAccountSwitch's reload — give it room to fully settle
}
async function getUserId(page) {
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  });
}

async function main() {
  const { app, page } = await launch();
  const SUPABASE_URL = readEnvVar('VITE_SUPABASE_URL');
  const SUPABASE_KEY = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  await signOutIfAny(page);
  await signUp(page, A);
  const userAId = await getUserId(page);
  check('[setup] A 회원가입', !!userAId, userAId);

  // Create + fully sync A's combo so it genuinely exists in Supabase tagged to A.
  const createResult = await page.evaluate(async () => {
    const { createCombo } = await import('/src/lib/combo/service.ts');
    return createCombo({ name: 'RACE_A_ONLY_COMBO', description: 'race test', techniqueIds: ['boxing__jab', 'boxing__cross'] }).id;
  });
  check('[setup] A 콤보 생성', !!createResult, createResult);
  const pushResult = await page.evaluate(async (userId) => {
    const { syncCombosBidirectional } = await import('/src/lib/cloudSync/comboSync.ts');
    return syncCombosBidirectional(userId);
  }, userAId);
  check('[setup] A 콤보가 Supabase에 실제로 push됨', pushResult.ok && pushResult.data.pushed >= 1, pushResult);

  // Switch to B for real (normal login, no artificial timing tricks — let
  // guardAccountSwitch's wipe+reload run and fully settle).
  await signOutIfAny(page);
  await signUp(page, B);
  const userBId = await getUserId(page);
  check('[setup] B 회원가입, A와 다른 계정', !!userBId && userBId !== userAId, userBId);
  await sleep(1500);

  const localBefore = await page.evaluate(async () => {
    const { comboRepository } = await import('/src/lib/combo/repository.ts');
    return comboRepository.list().map((c) => c.name);
  });
  check('[baseline] B 전환 직후 로컬 저장소에 RACE_A_ONLY_COMBO 없음', !localBefore.includes('RACE_A_ONLY_COMBO'), localBefore);

  // THE ACTUAL TEST: call syncCombosBidirectional(A.id) — A's user id — while
  // the verifiably, genuinely active session is B. This is exactly the call
  // shape a stale in-flight promise from A's login would produce the moment
  // it resumes after B has logged in.
  const currentSessionCheck = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  });
  check('[precondition] 현재 활성 세션이 실제로 B임 (테스트 전제조건)', currentSessionCheck === userBId, { currentSessionCheck, userBId });

  const raceCallResult = await page.evaluate(async (staleUserId) => {
    const { syncCombosBidirectional } = await import('/src/lib/cloudSync/comboSync.ts');
    // This is the exact call a stale A-login promise would make — argument
    // is A's id, but by the time this runs, the real active session is B.
    return syncCombosBidirectional(staleUserId);
  }, userAId);
  console.log('raceCallResult:', JSON.stringify(raceCallResult));

  const localAfter = await page.evaluate(async () => {
    const { comboRepository } = await import('/src/lib/combo/repository.ts');
    return comboRepository.list().map((c) => c.name);
  });
  check(
    '[TEST7] userId 인자(A)와 실제 활성 세션(B)이 불일치하는 스테일 동기화 호출이 B의 로컬 저장소를 오염시키지 않음',
    !localAfter.includes('RACE_A_ONLY_COMBO'),
    localAfter
  );
  check('[TEST7] 스테일 호출은 pulled=0으로 안전하게 스킵됨(에러 아님, 조용한 무시)', raceCallResult.ok && raceCallResult.data.pulled === 0, raceCallResult);

  // Also confirm B's OWN combos are unaffected by this stale call (didn't
  // accidentally wipe or touch B's real data either).
  const bAccessToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key)).access_token ?? null;
    } catch {
      return null;
    }
  });
  const bCloudCombos = await page.evaluate(
    async ({ url, apikey, userId, accessToken }) => {
      const res = await fetch(`${url}/rest/v1/combos?user_id=eq.${userId}&select=data`, {
        headers: { apikey, Authorization: `Bearer ${accessToken || apikey}` },
      });
      const body = await res.json().catch(() => null);
      return Array.isArray(body) ? body.map((r) => r.data?.name) : [];
    },
    { url: SUPABASE_URL, apikey: SUPABASE_KEY, userId: userBId, accessToken: bAccessToken }
  );
  check('[TEST7/Supabase] B의 Supabase 콤보 목록에 A의 콤보가 유출되지 않음', !bCloudCombos.includes('RACE_A_ONLY_COMBO'), bCloudCombos);

  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED ===`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
  }

  await app.close();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
