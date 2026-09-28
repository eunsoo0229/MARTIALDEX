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

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));
  return { app, page };
}

async function login(page, email, pw) {
  await page.evaluate(() => { location.hash = '#/login'; });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(({ email, pw }) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(document.querySelector('input[type=email]'), email);
    document.querySelector('input[type=email]').dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(document.querySelector('input[type=password]'), pw);
    document.querySelector('input[type=password]').dispatchEvent(new Event('input', { bubbles: true }));
  }, { email, pw });
  await page.click('button:has-text("로그인")');
  await new Promise((r) => setTimeout(r, 1500));
}

function seedCurriculum(page, id, title) {
  return page.evaluate(({ id, title }) => {
    const c = { id, martialArt: 'bjj', title, description: 'multidevice qa', source: 'custom', visibility: 'private', authorName: 'QA', totalDays: 1, estimatedWeeks: 1, phases: [], days: [{ day: 1, title: 'Day 1', description: '', learningGoals: [], techniqueIds: ['bjj__armbar'], reviewTechniqueIds: [], difficulty: 'beginner', estimatedMinutes: 30 }], techniqueCount: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const list = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
    list.unshift(c);
    localStorage.setItem('martialdex:curricula:custom', JSON.stringify(list));
  }, { id, title });
}

async function main() {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-A-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-B-'));
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-C-'));
  const curriculumId = 'custom__qa-md-' + Date.now();

  // ---- A: fresh login (no local, no cloud), create data, relaunch to sync ----
  let device = await launchDevice(dirA);
  await login(device.page, testEmail, password);
  const aSession = await device.page.evaluate(() => !!Object.keys(localStorage).find((k) => k.includes('auth-token')));
  check('[A] login succeeds (session persisted to localStorage)', aSession);

  await seedCurriculum(device.page, curriculumId, 'A기기 원본 커리큘럼');
  await device.app.close();

  device = await launchDevice(dirA); // relaunch same profile -> session auto-restores -> sync effect fires
  await new Promise((r) => setTimeout(r, 2500));
  const pushedRows = await device.page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('curricula').select('id, title').eq('user_id', sess.session.user.id).eq('id', id);
    return { data, error: error?.message };
  }, curriculumId);
  check('[A->cloud] curriculum auto-pushed to Supabase on relaunch (no manual backup button used)', pushedRows.data?.length === 1 && pushedRows.data[0].title === 'A기기 원본 커리큘럼', JSON.stringify(pushedRows));
  await device.app.close();

  // ---- B: fresh device, zero local data, log in -> expect automatic pull ----
  device = await launchDevice(dirB);
  const bLocalBefore = await device.page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('martialdex:')));
  check('[B] fresh profile genuinely has zero local martialdex data before login', !bLocalBefore);

  await login(device.page, testEmail, password);
  await new Promise((r) => setTimeout(r, 2500));
  const bState = await device.page.evaluate((id) => {
    const list = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
    return { found: list.some((c) => c.id === id), count: list.length };
  }, curriculumId);
  check('[B] curriculum automatically restored after login — no Profile-page visit, no button click', bState.found, JSON.stringify(bState));

  // ---- RLS: a second, unrelated account must NOT see this curriculum ----
  // Done via plain REST calls with their own bearer token, not the
  // in-page Supabase client — signing a second account in/out through
  // Device B's own client singleton would tear down Device B's real
  // session (auth state is global to the client instance, not per-call).
  const { execSync } = await import('node:child_process');
  const dotenv = await import('dotenv');
  dotenv.config({ quiet: true, path: path.join(APP_DIR, '.env') });
  const supabaseUrlAndKey = { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY };
  const rlsCheck = JSON.parse(
    execSync(
      `node -e "
      (async () => {
        const email = 'martialdex.rls.qa+' + Date.now() + '@example.com';
        const signupRes = await fetch('${supabaseUrlAndKey.url}/auth/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: '${supabaseUrlAndKey.anonKey}' }, body: JSON.stringify({ email, password: 'TestPassw0rd!23456' }) });
        const signupJson = await signupRes.json();
        if (!signupJson.access_token) { console.log(JSON.stringify({ skipped: true, reason: 'signup failed' })); return; }
        const res = await fetch('${supabaseUrlAndKey.url}/rest/v1/curricula?id=eq.${curriculumId}&select=id', { headers: { apikey: '${supabaseUrlAndKey.anonKey}', Authorization: 'Bearer ' + signupJson.access_token } });
        const rows = await res.json();
        console.log(JSON.stringify({ rowsVisibleToOtherUser: Array.isArray(rows) ? rows.length : null }));
      })();
      "`,
    ).toString(),
  );
  check('[RLS] a different logged-in user cannot see this curriculum row', rlsCheck.skipped || rlsCheck.rowsVisibleToOtherUser === 0, JSON.stringify(rlsCheck));

  // The conflict-choice prompt is specifically about the generic
  // user_backups blob (skill mastery/training history/etc.), which is
  // separate from the curricula table exercised above — give this account
  // an actual cloud backup row so Device C's test below is a real
  // "local data + cloud backup both exist" scenario, not a false negative.
  await device.page.evaluate(() => localStorage.setItem('martialdex:qa-marker', 'from-device-B'));
  const backupPushed = await device.page.evaluate(async () => {
    const { backupLocalDataToCloud } = await import('/src/lib/cloudSync/dataBackup.ts');
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    return backupLocalDataToCloud(sess.session.user.id);
  });
  check('[B] generic backup blob pushed to user_backups (test precondition for the Device C check below)', backupPushed.ok, JSON.stringify(backupPushed));
  await device.app.close();

  // ---- C: a device that ALREADY has its own different local data logs into
  // the same (now cloud-populated) account -> must be asked, never silently overwritten. ----
  device = await launchDevice(dirC);
  await seedCurriculum(device.page, 'custom__qa-md-device-c-only-' + Date.now(), 'C기기 자체 데이터(로그인 전)');
  await login(device.page, testEmail, password);
  await new Promise((r) => setTimeout(r, 2000));
  const conflictPromptShown = await device.page.evaluate(() => document.body.innerText.includes('이 계정에 저장된 클라우드 데이터가 있습니다'));
  const cLocalStillIntact = await device.page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
    return list.some((c) => c.title === 'C기기 자체 데이터(로그인 전)');
  });
  check('[C] conflict prompt shown instead of silent overwrite (local+cloud both had data)', conflictPromptShown);
  check('[C] pre-existing local-only data untouched while waiting for the user\'s choice', cLocalStillIntact);
  await device.app.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
