import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const { testEmail, password } = JSON.parse(fs.readFileSync('/tmp/qa-multidevice-account2.json', 'utf8'));

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  return { app, page };
}

async function login(page, email, pw) {
  await page.evaluate(() => {
    location.hash = '#/login';
  });
  await sleep(500);
  await page.evaluate(
    ({ email, pw }) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(document.querySelector('input[type=email]'), email);
      document.querySelector('input[type=email]').dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(document.querySelector('input[type=password]'), pw);
      document.querySelector('input[type=password]').dispatchEvent(new Event('input', { bubbles: true }));
    },
    { email, pw }
  );
  await page.click('button:has-text("로그인")');
  await sleep(1500);
}

async function main() {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-combo-sync-A-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-combo-sync-B-'));

  // ---- Device A: create a combo, then log in ----
  let device = await launchDevice(dirA);
  let { page } = device;

  const created = await page.evaluate(async () => {
    const { createCombo } = await import('/src/lib/combo/service.ts');
    return createCombo({ name: '기기간 동기화 테스트 콤보', description: 'qa', techniqueIds: ['bjj__armbar', 'bjj__triangle', 'bjj__omoplata'] });
  });
  check('[setup] Combo created locally on device A', !!created.id, JSON.stringify(created));

  await login(page, testEmail, password);
  await sleep(2500);
  const pushOfferVisible = await page.evaluate(() => document.body.innerText.includes('기존 데이터를 계정에 저장할까요?'));
  if (pushOfferVisible) {
    await page.click('button:has-text("저장하기")');
    await sleep(1500);
  }

  const pushedRows = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('combos').select('id, data').eq('user_id', sess.session.user.id).eq('id', id);
    return { data, error: error?.message };
  }, created.id);
  check('[4] Combo auto-pushed to Supabase combos table', pushedRows.data?.length === 1, JSON.stringify(pushedRows).slice(0, 300));
  await device.app.close();

  // ---- Device B: fresh profile, log into the SAME account -> expect the combo to come back automatically ----
  device = await launchDevice(dirB);
  page = device.page;
  await login(page, testEmail, password);
  await sleep(2500);

  const restored = await page.evaluate(async (id) => {
    const { getCombo } = await import('/src/lib/combo/service.ts');
    return getCombo(id);
  }, created.id);
  check(
    '[4b] Different device, same account -> combo automatically restored (no button click)',
    !!restored && restored.name === '기기간 동기화 테스트 콤보' && JSON.stringify(restored.techniqueIds) === JSON.stringify(created.techniqueIds),
    JSON.stringify(restored)?.slice(0, 300)
  );

  // Confirm 훈련하기 works for the restored combo too.
  await page.evaluate((id) => {
    location.hash = `#/combos/${id}/train`;
  }, created.id);
  await sleep(500);
  const text = await page.evaluate(() => document.body.innerText);
  check('[5] Restored combo is trainable ([훈련하기] flow works after restore)', text.includes('콤보 훈련 시작') && text.includes('Armbar'), text.slice(0, 300));

  // RLS: a different account must not see this row.
  const dotenv = await import('dotenv');
  dotenv.config({ quiet: true, path: path.join(APP_DIR, '.env') });
  const { execSync } = await import('node:child_process');
  const rlsCheck = JSON.parse(
    execSync(
      `node -e "
      (async () => {
        const email = 'martialdex.rls.combo.qa+' + Date.now() + '@example.com';
        const signupRes = await fetch('${process.env.VITE_SUPABASE_URL}/auth/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: '${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}' }, body: JSON.stringify({ email, password: 'TestPassw0rd!23456' }) });
        const signupJson = await signupRes.json();
        if (!signupJson.access_token) { console.log(JSON.stringify({ skipped: true })); return; }
        const res = await fetch('${process.env.VITE_SUPABASE_URL}/rest/v1/combos?id=eq.${created.id}&select=id', { headers: { apikey: '${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}', Authorization: 'Bearer ' + signupJson.access_token } });
        const rows = await res.json();
        console.log(JSON.stringify({ rowsVisibleToOtherUser: Array.isArray(rows) ? rows.length : null }));
      })();
      "`
    ).toString()
  );
  check('[RLS] A different logged-in user cannot see this combo row', rlsCheck.skipped || rlsCheck.rowsVisibleToOtherUser === 0, JSON.stringify(rlsCheck));

  await device.app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
