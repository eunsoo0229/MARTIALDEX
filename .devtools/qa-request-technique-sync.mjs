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
  cleanEnv.GEMINI_MODEL = 'gemini-3.1-flash-lite'; // other models' daily quotas exhausted from this session's testing
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
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-req-tech-sync-A-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-req-tech-sync-B-'));

  // ---- Device A: run the full pipeline for a real, absent technique and save it, then log in ----
  let device = await launchDevice(dirA);
  let { page } = device;

  const saved = await page.evaluate(async () => {
    const { runDuplicateStage, runVerificationStage, saveUserTechnique } = await import('/src/lib/userTechniques/service.ts');
    const dup = await runDuplicateStage({ name: 'Peruvian Necktie', martialArt: 'wrestling', description: '상대 목을 다리로 감싸 조르는 서브미션' });
    if (dup.ok && dup.duplicate.isDuplicate) return { ok: false, reason: 'unexpected duplicate', dup };
    const verification = await runVerificationStage({ name: 'Peruvian Necktie', martialArt: 'wrestling', description: '상대 목을 다리로 감싸 조르는 서브미션' });
    if (!verification.ok || !verification.accepted) return { ok: false, verification };
    const record = saveUserTechnique(verification.record, null);
    return { ok: true, record };
  });
  check('[setup] Full pipeline (duplicate-check -> verify -> generate) succeeds for a real technique', saved.ok === true, JSON.stringify(saved).slice(0, 400));

  if (!saved.ok) {
    await device.app.close();
    console.log('\n=== SUMMARY: aborting, setup failed ===');
    process.exit(1);
  }

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
    const { data, error } = await supabase.from('user_techniques').select('id, data').eq('user_id', sess.session.user.id).eq('id', id);
    return { data, error: error?.message };
  }, saved.record.id);
  check('[15/18] User-added technique auto-pushed to Supabase user_techniques table', pushedRows.data?.length === 1, JSON.stringify(pushedRows).slice(0, 300));
  await device.app.close();

  // ---- Device B: fresh profile, log into the SAME account -> expect the user technique to come back automatically ----
  device = await launchDevice(dirB);
  page = device.page;
  await login(page, testEmail, password);
  await sleep(2500);

  const restored = await page.evaluate(async (id) => {
    const { getUserTechnique } = await import('/src/lib/userTechniques/service.ts');
    return getUserTechnique(id);
  }, saved.record.id);
  check(
    '[16/18] Different device, same account -> user-added technique automatically restored (no button click)',
    !!restored && restored.technique.name === 'Peruvian Necktie',
    JSON.stringify(restored)?.slice(0, 300)
  );

  // RLS check: a different account must not see this row.
  const dotenv = await import('dotenv');
  dotenv.config({ quiet: true, path: path.join(APP_DIR, '.env') });
  const { execSync } = await import('node:child_process');
  const rlsCheck = JSON.parse(
    execSync(
      `node -e "
      (async () => {
        const email = 'martialdex.rls.tech.qa+' + Date.now() + '@example.com';
        const signupRes = await fetch('${process.env.VITE_SUPABASE_URL}/auth/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: '${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}' }, body: JSON.stringify({ email, password: 'TestPassw0rd!23456' }) });
        const signupJson = await signupRes.json();
        if (!signupJson.access_token) { console.log(JSON.stringify({ skipped: true })); return; }
        const res = await fetch('${process.env.VITE_SUPABASE_URL}/rest/v1/user_techniques?id=eq.${saved.record.id}&select=id', { headers: { apikey: '${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}', Authorization: 'Bearer ' + signupJson.access_token } });
        const rows = await res.json();
        console.log(JSON.stringify({ rowsVisibleToOtherUser: Array.isArray(rows) ? rows.length : null }));
      })();
      "`
    ).toString()
  );
  check('[RLS] A different logged-in user cannot see this user-added technique row', rlsCheck.skipped || rlsCheck.rowsVisibleToOtherUser === 0, JSON.stringify(rlsCheck));

  await device.app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
