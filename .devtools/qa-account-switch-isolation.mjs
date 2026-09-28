// Account data isolation audit — TEST 1-6 (sequential login/logout,
// same-type-conflict, empty-account, reverse-direction, refresh, page
// navigation). Uses two REAL throwaway Supabase accounts on the SAME
// Electron profile (same "device") to exercise the actual guardAccountSwitch
// + syncXBidirectional code paths end to end, not mocks.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const STAMP = Date.now();
const A = { email: `mdx.qa.isoA.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA격리A' };
const B = { email: `mdx.qa.isoB.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA격리B' };

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
  await sleep(2500);
}

async function logout(page) {
  // Header's logout button — reuse the real UI path (Header.tsx's handleLogout).
  await page.evaluate(async () => {
    const { signOutUser } = await import('/src/lib/auth/authService.ts');
    await signOutUser();
  });
  await sleep(1500); // let onAuthStateChange/guardAccountSwitch settle
}

async function getUserId(page) {
  return page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  });
}

async function createTestData(page, label) {
  return page.evaluate(async (label) => {
    const { createCustomCurriculum, saveCustomCurriculum, addDay, updateDay } = await import('/src/lib/curriculum/curriculumService.ts');
    const { createCombo } = await import('/src/lib/combo/service.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');

    let curriculum = createCustomCurriculum({ title: `${label}_CURRICULUM`, description: `${label} test curriculum`, martialArt: 'boxing', visibility: 'private' });
    curriculum = addDay(curriculum);
    curriculum = updateDay(curriculum, 1, { title: 'Day 1', learningGoals: [`${label} goal`] });
    curriculum = saveCustomCurriculum(curriculum);

    const combo = createCombo({ name: `${label}_COMBO`, description: `${label} test combo`, techniqueIds: ['boxing__jab', 'boxing__cross'] });

    const history = recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: ['boxing__jab'],
      completed: true,
      estimatedMinutes: 7,
      source: 'free_training',
      notes: `${label}_HISTORY_NOTE`,
    });

    return { curriculumId: curriculum.id, curriculumTitle: curriculum.title, comboId: combo.id, comboName: combo.name, historyId: history.id, historyNote: history.notes };
  }, label);
}

async function readLocalSnapshot(page) {
  return page.evaluate(async () => {
    const { curriculumRepository } = await import('/src/lib/curriculum/repository.ts');
    const { comboRepository } = await import('/src/lib/combo/repository.ts');
    const { trainingHistoryRepository } = await import('/src/lib/trainingHistory/repository.ts');
    return {
      curriculumTitles: curriculumRepository.listCustom().map((c) => c.title),
      comboNames: comboRepository.list().map((c) => c.name),
      historyNotes: trainingHistoryRepository.list().map((h) => h.notes).filter(Boolean),
    };
  });
}

async function supabaseCount(page, url, apikey, table, userId, filterField = 'user_id') {
  const accessToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key)).access_token ?? null;
    } catch {
      return null;
    }
  });
  return page.evaluate(
    async ({ url, apikey, table, userId, accessToken, filterField }) => {
      const res = await fetch(`${url}/rest/v1/${table}?${filterField}=eq.${userId}&select=*`, {
        headers: { apikey, Authorization: `Bearer ${accessToken || apikey}` },
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, rows: Array.isArray(body) ? body : [] };
    },
    { url, apikey, table, userId, accessToken, filterField }
  );
}

async function main() {
  const { app, page } = await launch();
  const SUPABASE_URL = readEnvVar('VITE_SUPABASE_URL');
  const SUPABASE_KEY = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  await signOutIfAny(page);

  // ---- TEST 1/setup: A signs up, creates distinctive data ----
  await signUp(page, A);
  const userAId = await getUserId(page);
  check('[setup] User A 회원가입', !!userAId, userAId);
  await sleep(2000); // let initial (empty) auto-sync settle before we create data
  const aData = await createTestData(page, 'A');
  check('[setup] A 데이터 생성(커리큘럼/콤보/훈련기록)', !!aData.curriculumId && !!aData.comboId && !!aData.historyId, aData);

  // Let the debounced CustomEvent-driven sync (and any residual login-time sync) push A's data to Supabase.
  await sleep(2500);
  const aLocalBefore = await readLocalSnapshot(page);
  check(
    '[setup] A 로컬 저장소에 A 데이터 확인됨',
    aLocalBefore.curriculumTitles.includes('A_CURRICULUM') && aLocalBefore.comboNames.includes('A_COMBO'),
    aLocalBefore
  );
  const aCloudCombos = await supabaseCount(page, SUPABASE_URL, SUPABASE_KEY, 'combos', userAId);
  check('[setup] A의 콤보가 실제 Supabase에 동기화됨', aCloudCombos.rows.some((r) => r.data?.name === 'A_COMBO'), aCloudCombos.rows.length);

  // ---- TEST 1: A -> logout -> B (fresh) login, B must see NOTHING of A's ----
  await logout(page);
  await signUp(page, B); // B doesn't exist yet — signUp also authenticates as B
  const userBId = await getUserId(page);
  check('[setup] User B 회원가입', !!userBId && userBId !== userAId, userBId);
  await sleep(2000);

  const bLocalAfterSwitch = await readLocalSnapshot(page);
  check(
    '[TEST1] A -> B 전환 후 B 로컬 저장소에 A 커리큘럼 없음',
    !bLocalAfterSwitch.curriculumTitles.includes('A_CURRICULUM'),
    bLocalAfterSwitch.curriculumTitles
  );
  check('[TEST1] A -> B 전환 후 B 로컬 저장소에 A 콤보 없음', !bLocalAfterSwitch.comboNames.includes('A_COMBO'), bLocalAfterSwitch.comboNames);
  check(
    '[TEST1] A -> B 전환 후 B 로컬 저장소에 A 훈련기록 없음',
    !bLocalAfterSwitch.historyNotes.includes('A_HISTORY_NOTE'),
    bLocalAfterSwitch.historyNotes
  );

  // ---- TEST 3: B has zero data (empty state) ----
  check(
    '[TEST3] B는 완전히 빈 상태(커리큘럼/콤보/훈련기록 0개)',
    bLocalAfterSwitch.curriculumTitles.length === 0 && bLocalAfterSwitch.comboNames.length === 0 && bLocalAfterSwitch.historyNotes.length === 0,
    bLocalAfterSwitch
  );

  // ---- TEST 2: B creates SAME-TYPE data with a different value, must not merge with A's ----
  const bData = await createTestData(page, 'B');
  check('[setup] B 데이터 생성', !!bData.curriculumId, bData);
  await sleep(2500);
  const bLocalWithData = await readLocalSnapshot(page);
  check(
    '[TEST2] B 데이터 생성 후에도 A_CURRICULUM은 여전히 없음(동일 종류 데이터 충돌 없음)',
    bLocalWithData.curriculumTitles.includes('B_CURRICULUM') && !bLocalWithData.curriculumTitles.includes('A_CURRICULUM'),
    bLocalWithData.curriculumTitles
  );

  const bCloudCombos = await supabaseCount(page, SUPABASE_URL, SUPABASE_KEY, 'combos', userBId);
  check(
    '[TEST2/Supabase] B의 Supabase 콤보 목록에 A_COMBO가 섞이지 않음',
    bCloudCombos.rows.some((r) => r.data?.name === 'B_COMBO') && !bCloudCombos.rows.some((r) => r.data?.name === 'A_COMBO'),
    bCloudCombos.rows.map((r) => r.data?.name)
  );

  // ---- TEST 5 (partial): refresh, still isolated ----
  await page.evaluate(() => location.reload());
  await sleep(2500);
  const bLocalAfterRefresh = await readLocalSnapshot(page);
  check(
    '[TEST5] 새로고침 후에도 B에게 A 데이터 없음',
    !bLocalAfterRefresh.curriculumTitles.includes('A_CURRICULUM') && !bLocalAfterRefresh.comboNames.includes('A_COMBO'),
    bLocalAfterRefresh
  );
  check('[TEST5] 새로고침 후 B 자신의 데이터는 유지됨', bLocalAfterRefresh.curriculumTitles.includes('B_CURRICULUM'), bLocalAfterRefresh.curriculumTitles);

  // ---- TEST 6: navigate across every user-data page, confirm A never reappears ----
  const pagesToCheck = ['#/training-history', '#/combos', '#/curricula', '#/profile', '#/tactics'];
  for (const hash of pagesToCheck) {
    await goto(page, hash);
    await sleep(600);
    const bodyText = await page.evaluate(() => document.body.innerText);
    check(`[TEST6] ${hash} 이동 후 페이지에 "A_" 데이터 텍스트 없음`, !bodyText.includes('A_CURRICULUM') && !bodyText.includes('A_COMBO') && !bodyText.includes('A_HISTORY_NOTE'));
  }

  // ---- TEST 4: reverse direction — B -> logout -> A (existing account) login, A must see only A's data ----
  await logout(page);
  await signIn(page, A);
  const userAId2 = await getUserId(page);
  check('[setup] A 재로그인', userAId2 === userAId, userAId2);
  await sleep(2500); // allow syncCurriculaBidirectional(A) etc. to pull A's own cloud data back

  const aLocalAfterReturn = await readLocalSnapshot(page);
  check(
    '[TEST4] B -> A 전환 후 A 로컬 저장소에 B 커리큘럼 없음',
    !aLocalAfterReturn.curriculumTitles.includes('B_CURRICULUM'),
    aLocalAfterReturn.curriculumTitles
  );
  check('[TEST4] B -> A 전환 후 A 로컬 저장소에 B 콤보 없음', !aLocalAfterReturn.comboNames.includes('B_COMBO'), aLocalAfterReturn.comboNames);
  check(
    '[TEST4] B -> A 전환 후 A 자신의 데이터(A_CURRICULUM)는 클라우드에서 정상 복원됨',
    aLocalAfterReturn.curriculumTitles.includes('A_CURRICULUM'),
    aLocalAfterReturn.curriculumTitles
  );

  const aCloudCombosAfter = await supabaseCount(page, SUPABASE_URL, SUPABASE_KEY, 'combos', userAId);
  check(
    '[TEST4/Supabase] A의 Supabase 콤보 목록에 B_COMBO가 섞이지 않음',
    !aCloudCombosAfter.rows.some((r) => r.data?.name === 'B_COMBO'),
    aCloudCombosAfter.rows.map((r) => r.data?.name)
  );

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
