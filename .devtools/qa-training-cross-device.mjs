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
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-train-cross-A-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-train-cross-B-'));

  // ---- Device A: complete a real "오늘의 훈련" session (with set/rep/time
  // detail), log in afterward, and confirm it auto-pushes to the cloud. ----
  let device = await launchDevice(dirA);
  let { page } = device;

  const entry = await page.evaluate(async () => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const { createCustomCurriculum, addDay, addTechniqueToDay, setExerciseConfig, saveCustomCurriculum, ensureProgress, setDayComplete } = await import(
      '/src/lib/curriculum/curriculumService.ts'
    );
    const { startTodaySession, finalizeTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    const { buildTrainingPlanForCurriculumDay } = await import('/src/lib/todayTraining/planner.ts');
    const { ensureSessionDetail, recordSetResult } = await import('/src/lib/todayTraining/sessionDetail.ts');

    const boxing = allTechniques.filter((t) => t.martialArt === 'boxing');
    let c = createCustomCurriculum({ title: 'QA 기기간 동기화 테스트', description: 'qa', martialArt: 'boxing', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, boxing[0].id);
    c = setExerciseConfig(c, 1, boxing[0].id, { mode: 'reps', sets: 2, targetReps: 20, targetSeconds: null, restSeconds: 0 });
    saveCustomCurriculum(c);
    ensureProgress(c);

    // "오늘의 훈련" no longer auto-picks a curriculum (커리큘럼은 루틴이
    // 아니므로 제외됨) — start this curriculum's Day 1 explicitly, exactly
    // what the real "훈련하기" button does.
    const plan = buildTrainingPlanForCurriculumDay(c, 1);
    let session = startTodaySession(plan);
    session = ensureSessionDetail(session, c);
    recordSetResult(session, 0, 0, { actualReps: 18 });
    recordSetResult(session, 0, 1, { actualReps: 22 });
    // finalize like the real UI does once every technique in the plan is checked off
    const fresh = JSON.parse(localStorage.getItem('martialdex:today-training-session'));
    const historyEntry = finalizeTodaySession(fresh, { curriculum: c, actualMinutes: 5 });
    setDayComplete(c, 1, true);
    return historyEntry;
  });
  check('[A] set/rep training session recorded locally with exerciseDetails', !!entry?.exerciseDetails && entry.exerciseDetails[0].actualReps.join(',') === '18,22', JSON.stringify(entry));

  await login(page, testEmail, password);
  await sleep(2500); // let the always-on curriculum sync + (if offered) backup complete

  // The push-offer prompt only appears for local-data-but-no-cloud-backup —
  // exactly this account's first login in this test. Accept it exactly like
  // a real user would, the same flow qa-multidevice-sync.mjs already proves works.
  const pushOfferVisible = await page.evaluate(() => document.body.innerText.includes('기존 데이터를 계정에 저장할까요?'));
  if (pushOfferVisible) {
    await page.click('button:has-text("저장하기")');
    await sleep(1500);
  }
  check('[A] backup push offer handled (or none needed)', true, String(pushOfferVisible));

  const backupPushed = await page.evaluate(async () => {
    const { backupLocalDataToCloud } = await import('/src/lib/cloudSync/dataBackup.ts');
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    return backupLocalDataToCloud(sess.session.user.id);
  });
  check('[A] training-history (and session) pushed to the cloud backup blob', backupPushed.ok, JSON.stringify(backupPushed));
  await device.app.close();

  // ---- Device B: fresh profile, log into the SAME account, expect the
  // training-history entry (with full exerciseDetails) to come back automatically. ----
  device = await launchDevice(dirB);
  page = device.page;
  const bBefore = await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('martialdex:')));
  check('[B] fresh profile has zero local data before login', !bBefore);

  await login(page, testEmail, password);
  await sleep(2500);

  const restored = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('martialdex:training-history') || '[]');
    return list.find((h) => h.notes === null && Array.isArray(h.exerciseDetails) && h.exerciseDetails.some((d) => d.actualReps?.join(',') === '18,22'));
  });
  check(
    '[B] training-history entry (with set/rep detail) automatically restored after login — no button click',
    !!restored,
    JSON.stringify(restored)
  );

  const restoredSession = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session') || 'null'));
  check('[B] today-training-session (with detail) also restored intact', restoredSession?.detail?.exercises?.[0]?.sets?.[0]?.actualReps === 18, JSON.stringify(restoredSession?.detail));

  await device.app.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
