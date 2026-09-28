// Account data isolation audit — follow-up check after TEST 7. The earlier
// race test showed Supabase RLS already blocks a syncX(...) call made with
// a mismatched userId argument from ever FETCHING another account's cloud
// data (a real, independent line of defense). This test checks the other
// end of the pipe deterministically: IF local storage ever ends up holding
// a foreign record (by whatever means — a race, a bug, anything), does
// syncXBidirectional's PUSH side notice and refuse to upload it under the
// current (different) account, or does it push blindly? No timing race
// needed — local storage is fully controlled directly.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const STAMP = Date.now();
const B = { email: `mdx.qa.pushcontam.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA오염B' };

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
  await signUp(page, B);
  const userBId = await getUserId(page);
  check('[setup] B 회원가입', !!userBId, userBId);
  await sleep(1500);

  // Directly inject a "foreign-looking" combo into local storage — simulates
  // ANY mechanism (already separately code-traced) that could leave another
  // account's data sitting in the shared local store.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('martialdex:combos') || '[]');
    raw.push({
      id: 'combo__injected-foreign',
      userId: null,
      name: 'INJECTED_FOREIGN_COMBO',
      description: 'simulated contamination',
      techniqueIds: ['boxing__jab', 'boxing__cross'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('martialdex:combos', JSON.stringify(raw));
  });

  const syncResult = await page.evaluate(async (userId) => {
    const { syncCombosBidirectional } = await import('/src/lib/cloudSync/comboSync.ts');
    return syncCombosBidirectional(userId);
  }, userBId);
  console.log('syncResult:', JSON.stringify(syncResult));

  await sleep(1000);
  const accessToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key)).access_token ?? null;
    } catch {
      return null;
    }
  });
  const cloudCombos = await page.evaluate(
    async ({ url, apikey, userId, accessToken }) => {
      const res = await fetch(`${url}/rest/v1/combos?user_id=eq.${userId}&select=data`, {
        headers: { apikey, Authorization: `Bearer ${accessToken || apikey}` },
      });
      const body = await res.json().catch(() => null);
      return Array.isArray(body) ? body.map((r) => r.data?.name) : [];
    },
    { url: SUPABASE_URL, apikey: SUPABASE_KEY, userId: userBId, accessToken }
  );

  check(
    '[finding] 로컬에 주입된 타 계정 데이터가 현재(B) 계정 Supabase로 실제로 push됨 (push 시점에 소유권 재검증 없음 확인)',
    cloudCombos.includes('INJECTED_FOREIGN_COMBO'),
    cloudCombos
  );

  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED (여기서 "PASS"는 소유권 미검증 사실 확인을 의미) ===`);

  await app.close();
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
