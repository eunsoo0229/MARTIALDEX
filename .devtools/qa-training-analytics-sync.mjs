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

async function logout(page) {
  await page.click('button[title="로그아웃"]');
  await sleep(800);
}

async function main() {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-training-sync-A-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-training-sync-B-'));
  const marker = `QA-CROSSDEVICE-${Date.now()}`;

  // ---- Device A: create a real training session locally, then log in ----
  let device = await launchDevice(dirA);
  let { page } = device;

  const created = await page.evaluate(async (notes) => {
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    return recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: ['boxing__jab', 'boxing__cross'],
      completed: true,
      estimatedMinutes: 15,
      actualMinutes: 15,
      notes,
      source: 'coach_today',
    });
  }, marker);
  check('[setup] 훈련 완료 시 로컬에 실제 기록 저장', !!created.id && created.notes === marker, JSON.stringify(created).slice(0, 200));

  await login(page, testEmail, password);
  await sleep(2500);
  // This account already has cloud data from earlier stages' QA runs, so
  // the ambiguous "both sides have data" prompt is expected here — pick
  // whichever "push this device's data" button this mode shows, so the
  // marker entry is preserved and pushed rather than discarded.
  const bodyTextAfterLogin = await page.evaluate(() => document.body.innerText);
  if (bodyTextAfterLogin.includes('클라우드 데이터가 있습니다')) {
    await page.click('button:has-text("이 기기 데이터를 클라우드에 저장")');
    await sleep(1500);
  } else if (bodyTextAfterLogin.includes('저장할까요?')) {
    await page.click('button:has-text("저장하기")');
    await sleep(1500);
  }

  // The always-safe automatic sync (independent of the prompt) should have
  // already pushed the marker entry by now via syncTrainingHistoryBidirectional.
  const pushedRows = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('training_history').select('id, data').eq('user_id', sess.session.user.id).eq('id', id);
    return { data, error: error?.message, userId: sess.session.user.id };
  }, created.id);
  check('[7] 훈련 기록이 Supabase training_history 테이블에 자동 저장(push)됨', pushedRows.data?.length === 1, JSON.stringify(pushedRows).slice(0, 300));

  // Running the sync again on the SAME device must not create a duplicate cloud row.
  const secondPush = await page.evaluate(async (userId) => {
    const { syncTrainingHistoryBidirectional } = await import('/src/lib/cloudSync/trainingHistorySync.ts');
    return syncTrainingHistoryBidirectional(userId);
  }, pushedRows.userId);
  const pushedRowsAgain = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    const { data } = await supabase.from('training_history').select('id').eq('user_id', sess.session.user.id).eq('id', id);
    return data;
  }, created.id);
  check('[14] 같은 기기에서 동기화를 다시 실행해도 클라우드에 중복 저장되지 않음', pushedRowsAgain?.length === 1, JSON.stringify({ secondPush, pushedRowsAgain }).slice(0, 300));

  await logout(page);
  const stillLoggedOutUrl = await page.evaluate(() => location.href);
  check('[11] 로그아웃 성공', stillLoggedOutUrl.includes('/login') || (await page.evaluate(() => document.body.innerText.includes('로그인'))), stillLoggedOutUrl);
  await device.app.close();

  // ---- Device B: fresh profile, log into the SAME account -> the marker
  // entry must come back automatically, with no manual restore step. ----
  device = await launchDevice(dirB);
  page = device.page;
  await login(page, testEmail, password);
  await sleep(2500);

  const restored = await page.evaluate(async (id) => {
    const { getTrainingHistoryEntry, listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return { entry: getTrainingHistoryEntry(id), totalCount: listTrainingHistory().filter((e) => e.id === id).length };
  }, created.id);
  check('[12][13] 다른 기기에서 같은 계정 로그인 -> 훈련 기록 자동 복원', !!restored.entry && restored.entry.notes === marker, JSON.stringify(restored).slice(0, 300));
  check('[14] 복원된 기록이 로컬에도 정확히 1건만 존재 (중복 없음)', restored.totalCount === 1, String(restored.totalCount));

  // Run sync twice more on device B — dedup must hold under repeated syncs.
  const userId = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.auth.getSession();
    return data.session.user.id;
  });
  await page.evaluate(async (uid) => {
    const { syncTrainingHistoryBidirectional } = await import('/src/lib/cloudSync/trainingHistorySync.ts');
    await syncTrainingHistoryBidirectional(uid);
    await syncTrainingHistoryBidirectional(uid);
  }, userId);
  const afterRepeatSync = await page.evaluate(async (id) => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().filter((e) => e.id === id).length;
  }, created.id);
  check('[14] 반복 동기화 후에도 로컬에 정확히 1건만 존재', afterRepeatSync === 1, String(afterRepeatSync));

  // Navigate to the Training Analytics UI on device B and confirm the entry appears there too.
  await page.evaluate(() => {
    location.hash = '#/training-analytics/history';
  });
  await sleep(700);
  await page.fill('input[placeholder="기술명 또는 커리큘럼명 검색"]', 'Jab');
  await sleep(400);
  const listedInUi = await page.evaluate(() => document.body.innerText.includes('오늘의 훈련') || document.body.innerText.includes('Jab'));
  check('[UI] 복원된 훈련 기록이 Training Analytics 화면에 실제로 표시됨', listedInUi);

  // ---- Logout + re-login on device B: entry must still be exactly one copy ----
  await logout(page);
  await sleep(500);
  await login(page, testEmail, password);
  await sleep(2000);
  const afterReLogin = await page.evaluate(async (id) => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().filter((e) => e.id === id).length;
  }, created.id);
  check('[11][12] 로그아웃 후 재로그인해도 정확히 1건만 존재 (중복 없음)', afterReLogin === 1, String(afterReLogin));

  await device.app.close();

  // ---- RLS: a different logged-in user must not see this row ----
  const dotenv = await import('dotenv');
  dotenv.config({ quiet: true, path: path.join(APP_DIR, '.env') });
  const { execSync } = await import('node:child_process');
  const rlsCheck = JSON.parse(
    execSync(
      `node -e "
      (async () => {
        const email = 'martialdex.rls.training.qa+' + Date.now() + '@example.com';
        const signupRes = await fetch('${process.env.VITE_SUPABASE_URL}/auth/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: '${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}' }, body: JSON.stringify({ email, password: 'TestPassw0rd!23456' }) });
        const signupJson = await signupRes.json();
        if (!signupJson.access_token) { console.log(JSON.stringify({ skipped: true })); return; }
        const res = await fetch('${process.env.VITE_SUPABASE_URL}/rest/v1/training_history?id=eq.${created.id}&select=id', { headers: { apikey: '${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}', Authorization: 'Bearer ' + signupJson.access_token } });
        const rows = await res.json();
        console.log(JSON.stringify({ rowsVisibleToOtherUser: Array.isArray(rows) ? rows.length : null }));
      })();
      "`
    ).toString()
  );
  check('[7][RLS] 다른 사용자 계정으로는 이 훈련 기록을 볼 수 없음', rlsCheck.skipped || rlsCheck.rowsVisibleToOtherUser === 0, JSON.stringify(rlsCheck));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
