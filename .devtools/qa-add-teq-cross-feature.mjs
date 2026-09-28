import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accounts = JSON.parse(fs.readFileSync('/tmp/qa-addteq-accounts.json', 'utf8'));
const results = [];
function check(name, pass, detail = '') { results.push({ name, pass, detail }); console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : '')); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-test79-'));
  const cleanEnv = { ...process.env }; delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.waitForLoadState('load');
  await sleep(800);

  const login = await page.evaluate(async ({ email, password }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { ok: !error, userId: data?.user?.id ?? null };
  }, accounts[0]);
  check('[사전] 로그인', login.ok, JSON.stringify(login));
  await sleep(1500);

  // ============ TEST 9: MMA combo reuses already-registered add_teq (bjj__buggy-choke), no new AI call ============
  const test9 = await page.evaluate(async (userId) => {
    const { resolveComboStep } = await import('/src/lib/aiCombo/stepResolver.ts');
    const usedIds = new Set();
    const steps = [
      { phrase: 'Jab', purpose: 'setup' },
      { phrase: 'Double Leg', purpose: 'takedown' },
      { phrase: 'Buggy Choke', purpose: 'finish' },
    ];
    const out = [];
    for (const s of steps) out.push(await resolveComboStep(s, 'mma', undefined, usedIds, userId));
    return out;
  }, login.userId);
  check('[TEST 9] MMA 콤비네이션 3단계 모두 실제 techniqueId 반환', test9.every((r) => !!r.techniqueId), JSON.stringify(test9));
  check('[TEST 9] Jab/Double Leg는 원천 무술(복싱/레슬링)에서 발견', /^(boxing|kickboxing|muay-thai)__/.test(test9[0].martialArt) && /^wrestling__/.test(test9[1].martialArt), `${test9[0].martialArt}, ${test9[1].martialArt}`);
  check('[TEST 9] Buggy Choke는 add_teq에서 재사용됨(재등록 없음, discovered=false)', test9[2].techniqueId === 'bjj__buggy-choke' && test9[2].discovered === false, JSON.stringify(test9[2]));

  // ============ TEST 7: add_teq 기술을 자유훈련에 추가 -> resolve -> 훈련 -> 기록 ============
  await page.evaluate(() => { location.hash = '#/free-training'; });
  await sleep(500);
  await page.evaluate(() => {
    const select = document.querySelectorAll('select.select')[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'bjj');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);
  await page.evaluate(async () => {
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const { getDefaultExerciseConfig } = await import('/src/lib/todayTraining/exerciseDefaults.ts');
    const { addDraftEntry } = await import('/src/lib/freeTraining/draftStore.ts');
    const t = resolveTechnique('bjj__twister');
    addDraftEntry({ techniqueId: t.id, config: { ...getDefaultExerciseConfig(t), sets: 1, targetReps: 3 } });
  });
  await sleep(300);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[TEST 7] add_teq 기술(Twister)이 자유훈련 화면에 표시됨', bodyText.includes('Twister'), bodyText.slice(0, 200));

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '훈련 시작');
    if (btn) btn.click();
  });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[TEST 7] add_teq 기술로 실제 자유훈련이 시작됨', bodyText.includes('Twister'), bodyText.slice(0, 200));

  const setDone = await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const input = document.querySelector('input[type="number"][placeholder]');
    if (input) { setter.call(input, '5'); input.dispatchEvent(new Event('input', { bubbles: true })); }
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '세트 완료');
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  await sleep(600);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[TEST 7] add_teq 기술 훈련 완료 화면 도달', setDone && bodyText.includes('자유훈련 완료'), bodyText.slice(0, 200));

  const historyEntry = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().find((e) => e.source === 'free_training' && e.techniqueIds.includes('bjj__twister'));
  });
  check('[TEST 7] trainingHistory에 add_teq 기술 포함 훈련 기록이 저장됨', !!historyEntry, JSON.stringify(historyEntry));

  // ============ TEST 4b / 5b: use already-discovered add_teq entries through the real downstream structures ============
  const comboResult = await page.evaluate(async () => {
    const { createCombo, validateCombo } = await import('/src/lib/combo/service.ts');
    const techniqueIds = ['bjj__armbar', 'bjj__buggy-choke'];
    const validation = validateCombo('QA AI콤비 신규기술 콤보', techniqueIds);
    if (!validation.ok) return { ok: false, errors: validation.errors };
    const combo = createCombo({ name: 'QA AI콤비 신규기술 콤보', description: '', techniqueIds });
    return { ok: true, id: combo.id, techniqueIds: combo.techniqueIds };
  });
  check('[TEST 4] add_teq 기술을 포함한 콤보가 정상 저장됨(기존 Combo 구조 재사용)', comboResult.ok, JSON.stringify(comboResult));

  const planResult = await page.evaluate(async () => {
    const { planGoalCurriculum } = await import('/src/lib/aiCurriculum/curriculumPlanner.ts');
    const { days } = planGoalCurriculum({
      subjectLabel: 'QA 테스트',
      matches: [
        { techniqueId: 'bjj__estima-lock', techniqueName: 'Estima Lock', martialArt: 'bjj', relevanceScore: 90, reason: 'test', phase: 'connection' },
        { techniqueId: 'bjj__armbar', techniqueName: 'Armbar', martialArt: 'bjj', relevanceScore: 80, reason: 'test', phase: 'connection' },
      ],
      targetDays: 3,
      intensity: 'light',
      userLevel: 'intermediate',
    });
    return { days, includesDiscovered: days.some((d) => d.techniqueIds.includes('bjj__estima-lock')) };
  });
  check('[TEST 5] add_teq로 발견된 기술이 실제 커리큘럼 Day에 포함됨', planResult.includesDiscovered, JSON.stringify(planResult.days.map((d) => d.techniqueIds)));

  check('[regression] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) { console.log('FAILURES:'); for (const f of failed) console.log(' -', f.name, '::', f.detail); }
  process.exit(failed.length > 0 ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
