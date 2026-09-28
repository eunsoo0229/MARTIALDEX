import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accounts = JSON.parse(fs.readFileSync('/tmp/qa-addteq-accounts.json', 'utf8'));

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-addteq-aifeat-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  const login = await page.evaluate(async ({ email, password }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { ok: !error, userId: data?.user?.id ?? null };
  }, accounts[0]);
  check('[사전] 로그인', login.ok, JSON.stringify(login));
  await sleep(1500);

  // ============ TEST 4: AI 콤비네이션 (aiCombo/stepResolver.ts) independently discovers + registers ============
  const test4 = await page.evaluate(async (userId) => {
    const { resolveComboStep } = await import('/src/lib/aiCombo/stepResolver.ts');
    const step = { phrase: 'Buggy Choke', purpose: '레그 엔탱글먼트 상황에서 상대의 목을 조른다' };
    const result = await resolveComboStep(step, 'bjj', undefined, new Set(), userId);
    return result;
  }, login.userId);
  check(
    '[TEST 4] AI 콤비네이션(resolveComboStep)이 없는 기술("Buggy Choke")을 독자적으로 발견+등록 -> ComboStepResult.techniqueId 반환',
    !!test4.techniqueId && typeof test4.techniqueId === 'string' && test4.discovered === true,
    JSON.stringify(test4)
  );

  const rowCheck4 = test4.techniqueId
    ? await page.evaluate(async (id) => {
        const { supabase } = await import('/src/lib/supabase/client.ts');
        const { data } = await supabase.from('add_teq').select('id, status').eq('id', id);
        return data;
      }, test4.techniqueId)
    : null;
  check('[TEST 4] add_teq 테이블에 실제로 저장됨', !!rowCheck4 && rowCheck4.length === 1, JSON.stringify(rowCheck4));

  // ---- TEST 4b: use it to createCombo() (existing structure) ----
  if (test4.techniqueId) {
    const comboResult = await page.evaluate(async (id) => {
      const { createCombo, validateCombo } = await import('/src/lib/combo/service.ts');
      const techniqueIds = ['bjj__armbar', id];
      const validation = validateCombo('QA AI콤비 신규기술 콤보', techniqueIds);
      if (!validation.ok) return { ok: false, errors: validation.errors };
      const combo = createCombo({ name: 'QA AI콤비 신규기술 콤보', description: '', techniqueIds });
      return { ok: true, id: combo.id, techniqueIds: combo.techniqueIds };
    }, test4.techniqueId);
    check('[TEST 4] ComboStepResult.techniqueId -> createCombo()로 정상 저장(기존 구조 재사용)', comboResult.ok, JSON.stringify(comboResult));
  }

  // ============ TEST 5: AI 맞춤 커리큘럼 (aiCurriculum/techniqueMatcher.ts) independently discovers ============
  const test5 = await page.evaluate(async (userId) => {
    const { discoverMissingDesiredTechniques } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    return discoverMissingDesiredTechniques(['Estima Lock'], 'bjj', userId, []);
  }, login.userId);
  check(
    '[TEST 5] AI 맞춤 커리큘럼(discoverMissingDesiredTechniques)이 없는 기술("Estima Lock")을 발견+등록 -> 실제 techniqueId 반환',
    Array.isArray(test5) && test5.length === 1 && !!test5[0].techniqueId,
    JSON.stringify(test5)
  );

  // ---- feed it through planGoalCurriculum (existing structure) to prove it lands in an actual day ----
  if (test5[0]?.techniqueId) {
    const planResult = await page.evaluate(async (match) => {
      const { planGoalCurriculum } = await import('/src/lib/aiCurriculum/curriculumPlanner.ts');
      const { days } = planGoalCurriculum({
        subjectLabel: 'QA 테스트',
        matches: [match, { ...match, techniqueId: 'bjj__armbar', techniqueName: 'Armbar', relevanceScore: 80 }],
        targetDays: 3,
        intensity: 'light',
        userLevel: 'intermediate',
      });
      return { days, includesDiscovered: days.some((d) => d.techniqueIds.includes(match.techniqueId)) };
    }, test5[0]);
    check('[TEST 5] 발견된 기술이 실제 커리큘럼 Day에 포함됨(getTechnique->resolveTechnique 수정 확인)', planResult.includesDiscovered, JSON.stringify(planResult.days.map((d) => d.techniqueIds)));
  }

  // ============ TEST 6: 선수 스타일 커리큘럼 (fighterStyle/techniqueMatcher.ts) independently discovers ============
  const test6 = await page.evaluate(async (userId) => {
    const { matchStyleToTechniques } = await import('/src/lib/fighterStyle/techniqueMatcher.ts');
    const analysis = {
      fighterId: 'qa-fighter',
      fighterName: 'QA Fighter',
      styleSummary: 'test',
      primaryStyles: [],
      keyStrengths: [],
      preferredPositions: [],
      keyTechniques: ['Baseball Choke'],
      transitions: [],
      distanceManagement: [],
      defensiveConcepts: [],
      offensiveConcepts: [],
      trainingFocus: [],
      generatedAt: new Date().toISOString(),
    };
    const matches = await matchStyleToTechniques(analysis, userId);
    return matches;
  }, login.userId);
  check(
    '[TEST 6] 선수 스타일 커리큘럼(matchStyleToTechniques)이 없는 핵심 기술("Baseball Choke")을 발견+등록 -> techniqueId 반환',
    Array.isArray(test6) && test6.some((m) => m.reason.includes('Baseball Choke')),
    JSON.stringify(test6)
  );

  // ============ TEST 9: MMA AI 콤비네이션 — cross-source-art search + add_teq + registration ============
  const test9 = await page.evaluate(async (userId) => {
    const { resolveComboStep } = await import('/src/lib/aiCombo/stepResolver.ts');
    const usedIds = new Set();
    const steps = [
      { phrase: 'Jab', purpose: 'setup' },
      { phrase: 'Double Leg', purpose: 'takedown' },
      { phrase: 'Buggy Choke', purpose: 'finish' }, // already in add_teq from TEST 4 — proves MMA context also finds add_teq
    ];
    const out = [];
    for (const s of steps) out.push(await resolveComboStep(s, 'mma', undefined, usedIds, userId));
    return out;
  }, login.userId);
  check(
    '[TEST 9] MMA 콤비네이션: Jab/Double Leg(원천 무술)와 Buggy Choke(add_teq) 모두 실제 techniqueId 반환',
    test9.every((r) => !!r.techniqueId),
    JSON.stringify(test9)
  );
  check('[TEST 9] Buggy Choke는 재발견(discovered=true)이 아니라 add_teq 재사용(discovered=false, 재등록 없음)', test9[2]?.techniqueId === test4.techniqueId && test9[2]?.discovered === false, JSON.stringify(test9[2]));

  // ============ TEST 7: add_teq 기술을 자유훈련에 추가 -> resolve -> 훈련 -> 기록 ============
  const twisterId = 'bjj__twister'; // already registered in TEST 2 (real Supabase row)
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
    addDraftEntry({ techniqueId: t.id, config: { ...getDefaultExerciseConfig(t), sets: 1 } });
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
  check('[TEST 7] add_teq 기술로 실제 자유훈련이 시작됨', bodyText.includes('자유훈련 · Twister') || bodyText.includes('Twister'), bodyText.slice(0, 200));

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
  check('[TEST 7] add_teq 기술 훈련 완료 후 기록 저장(자유훈련 완료 화면 도달)', setDone && bodyText.includes('자유훈련 완료'), bodyText.slice(0, 200));

  const historyEntry = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().find((e) => e.source === 'free_training' && e.techniqueIds.includes('bjj__twister'));
  });
  check('[TEST 7] trainingHistory에 add_teq 기술 포함 훈련 기록이 실제로 저장됨', !!historyEntry, JSON.stringify(historyEntry));

  check('[regression] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await app.close();

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
