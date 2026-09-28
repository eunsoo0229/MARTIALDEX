import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

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
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

function seedCustomCurriculum(page, { martialArt, techA, techB }) {
  return page.evaluate(
    async ({ martialArt, techA, techB }) => {
      const { createCustomCurriculum, addDay, addTechniqueToDay, setExerciseConfig, saveCustomCurriculum, ensureProgress } = await import(
        '/src/lib/curriculum/curriculumService.ts'
      );
      let c = createCustomCurriculum({ title: 'QA 오늘의 훈련 커리큘럼', description: 'qa', martialArt, visibility: 'private' });
      c = addDay(c);
      c = addTechniqueToDay(c, 1, techA.id);
      c = addTechniqueToDay(c, 1, techB.id);
      c = setExerciseConfig(c, 1, techA.id, { mode: 'reps', sets: techA.sets, targetReps: techA.targetReps, targetSeconds: null, restSeconds: techA.restSeconds });
      c = setExerciseConfig(c, 1, techB.id, { mode: 'time', sets: 1, targetReps: null, targetSeconds: techB.targetSeconds, restSeconds: 0 });
      saveCustomCurriculum(c);
      ensureProgress(c);
      return c.id;
    },
    { martialArt, techA, techB }
  );
}

async function findRealTechniqueIds(page, martialArt) {
  return page.evaluate(async (martialArt) => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const results = allTechniques.filter((t) => t.martialArt === martialArt);
    return [results[0]?.id, results[1]?.id].filter(Boolean);
  }, martialArt);
}

async function main() {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-train-A-'));

  let device = await launchDevice(dirA);
  let { page } = device;

  // Find two real BJJ techniques from the actual 1253-technique dataset —
  // never invent training content outside it (spec item 12).
  const [techAId, techBId] = await findRealTechniqueIds(page, 'bjj');
  check('[setup] found two real BJJ techniques from the catalog to drive the test', !!techAId && !!techBId, JSON.stringify([techAId, techBId]));

  const curriculumId = await seedCustomCurriculum(page, {
    martialArt: 'bjj',
    techA: { id: techAId, sets: 3, targetReps: 5, restSeconds: 2 },
    techB: { id: techBId, targetSeconds: 2 },
  });

  // Ensure auto-progress is OFF for the first exercise (to test the manual
  // "다음 훈련" path) — we'll flip it ON before the second exercise to also
  // cover the automatic path in the same run.
  await page.evaluate(() => localStorage.setItem('martialdex:today-training-auto-progress', '0'));

  // "오늘의 훈련" no longer auto-picks an in-progress curriculum (커리큘럼은
  // 루틴이 아니므로 자동 반영 대상에서 제외됨— see planner.ts's
  // generateTodayTrainingPlan()) — a curriculum session is started
  // EXPLICITLY here via startCurriculumDayTraining(), the exact function the
  // real "훈련하기" button calls. Everything the rest of this test exercises
  // (set tracking, rest timer, pause/resume, persistence) reads/writes the
  // same session state regardless of which entry point started it, so this
  // is a faithful stand-in for clicking "훈련하기" on the curriculum's own page.
  await page.evaluate(async (curriculumId) => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { startCurriculumDayTraining } = await import('/src/lib/todayTraining/sessionStore.ts');
    startCurriculumDayTraining(getCurriculum(curriculumId), 1);
  }, curriculumId);

  await page.evaluate(() => {
    location.hash = '#/today-training';
  });
  await sleep(600);

  // ---- item 1: 오늘의 훈련 entry point shows the already-started curriculum session ----
  const entryText = await page.evaluate(() => document.body.innerText);
  check('[1] 오늘의 훈련 shows the curriculum session started via 훈련하기, straight into the set tracker', entryText.includes('SET 1 / 3'), entryText.slice(0, 200));

  // ---- item 2 & 3: set-based tracking + rep recording (not auto-filled to target) ----
  let text = await page.evaluate(() => document.body.innerText);
  check('[2] set tracker shows SET 1 / 3 for the first exercise', text.includes('SET 1 / 3'), text.slice(0, 300));

  await page.fill('input[type=number]', '7'); // deliberately different from target (5)
  await page.click('button:has-text("세트 완료")');
  await sleep(400);

  const afterSet1 = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('martialdex:today-training-session'));
    return s?.detail?.exercises?.[0]?.sets?.[0];
  });
  check('[3] actual rep count (7) saved as-is, not auto-completed to the target (5)', afterSet1?.actualReps === 7, JSON.stringify(afterSet1));

  // ---- item 5 & 6 (pause/resume rest timer) ----
  text = await page.evaluate(() => document.body.innerText);
  check('[5] rest timer appears after set 1 completes', /휴식/.test(text), text.slice(0, 200));

  await page.click('button:has-text("일시정지")');
  const remainingAtPause = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('martialdex:today-training-session'));
    return s?.detail?.restTimer?.pausedRemainingMs;
  });
  await sleep(900);
  const remainingStillPaused = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('martialdex:today-training-session'));
    return s?.detail?.restTimer?.pausedRemainingMs;
  });
  check('[6] pausing the rest timer freezes the remaining time (no drift while paused)', remainingAtPause !== undefined && remainingAtPause === remainingStillPaused, JSON.stringify({ remainingAtPause, remainingStillPaused }));

  await page.click('button:has-text("재개")');
  await sleep(2600); // longer than the 2s rest -> should expire on its own
  text = await page.evaluate(() => document.body.innerText);
  check('[5b] rest timer shows "휴식 종료" once the deadline passes', text.includes('휴식 종료'), text.slice(0, 200));

  await page.click('button:has-text("다음 세트 시작")');
  await sleep(400);
  text = await page.evaluate(() => document.body.innerText);
  check('[progress] advanced to SET 2 / 3 after the rest ended', text.includes('SET 2 / 3'), text.slice(0, 200));

  // ---- item 7 (skip rest timer) ----
  await page.fill('input[type=number]', '5');
  await page.click('button:has-text("세트 완료")');
  await sleep(300);
  text = await page.evaluate(() => document.body.innerText);
  check('[5c] rest timer appears again after set 2', /휴식/.test(text), text.slice(0, 200));
  await page.click('button:has-text("건너뛰기")');
  await sleep(300);
  text = await page.evaluate(() => document.body.innerText);
  check('[7] skipping rest immediately advances to SET 3 / 3', text.includes('SET 3 / 3'), text.slice(0, 200));

  // Final set of exercise A — completing it finishes the exercise. Since
  // auto-progress is OFF, the manual "다음 훈련" card should appear instead
  // of jumping straight to exercise B.
  await page.fill('input[type=number]', '3');
  await page.click('button:has-text("세트 완료")');
  await sleep(400);
  text = await page.evaluate(() => document.body.innerText);
  check('[6b] auto-progress OFF: manual "다음 훈련" card shown instead of auto-advancing', text.includes('다음 훈련'), text.slice(0, 300));

  // Flip auto-progress ON before moving to exercise B, to also exercise the automatic path.
  await page.evaluate(() => localStorage.setItem('martialdex:today-training-auto-progress', '1'));
  await page.click('button:has-text("다음 훈련")');
  await sleep(400);

  // ---- item 4: time-based exercise, auto-completes at target ----
  text = await page.evaluate(() => document.body.innerText);
  check('[4a] second exercise (time-based) shows a 시작 button and target seconds', text.includes('목표: 2초') && text.includes('시작'), text.slice(0, 300));

  await page.click('button:has-text("시작")');
  await sleep(2700); // longer than the 2s target -> should auto-complete AND auto-advance (auto-progress now ON)

  const finalSession = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session')));
  check('[4b] time-based set auto-completed at the target (2s), actualSeconds recorded', finalSession?.detail?.exercises?.[1]?.sets?.[0]?.actualSeconds === 2, JSON.stringify(finalSession?.detail?.exercises?.[1]));
  check('[6c] auto-progress ON: session auto-finished (both techniques completed) without a manual click', finalSession?.completedTechniqueIds?.length === 2, JSON.stringify(finalSession?.completedTechniqueIds));

  // ---- item 9: completion summary ----
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[9] completion screen shows summary stats (완료 세트, 총 훈련 시간)', text.includes('완료') && text.includes('완료 세트') && text.includes('총 훈련 시간'), text.slice(0, 400));

  // ---- item 10: training record persistence, connected to existing storage ----
  const historyEntry = await page.evaluate((curriculumId) => {
    const list = JSON.parse(localStorage.getItem('martialdex:training-history') || '[]');
    return list.find((h) => h.curriculumId === curriculumId);
  }, curriculumId);
  check(
    '[10] trainingHistory entry recorded with full exerciseDetails (sets/target/actual/rest/timestamps)',
    !!historyEntry &&
      historyEntry.completed === true &&
      Array.isArray(historyEntry.exerciseDetails) &&
      historyEntry.exerciseDetails.length === 2 &&
      historyEntry.exerciseDetails[0].actualReps.join(',') === '7,5,3' &&
      historyEntry.exerciseDetails[0].restSeconds === 2 &&
      historyEntry.exerciseDetails[1].actualSeconds[0] === 2,
    JSON.stringify(historyEntry)
  );

  check('[setup] no page-error exceptions thrown during the full run so far', device.consoleErrors.length === 0, JSON.stringify(device.consoleErrors));

  await device.app.close();

  // ==================================================================
  // Recovery test (item 11): start a second, fresh session in the same
  // profile, complete one set, kill the app mid-session, relaunch, and
  // confirm the exact set/timer state survives.
  // ==================================================================
  device = await launchDevice(dirA);
  page = device.page;
  const [tech2AId, tech2BId] = await findRealTechniqueIds(page, 'wrestling');
  await seedCustomCurriculum(page, {
    martialArt: 'wrestling',
    techA: { id: tech2AId, sets: 2, targetReps: 8, restSeconds: 30 },
    techB: { id: tech2BId, targetSeconds: 30 },
  });
  // "오늘의 훈련" is one session per calendar day by design — the previous
  // sub-test already finished today's session, so start a fresh one for this
  // new curriculum exactly the way a real user would (clearTodaySession is a
  // real exported part of the API, not a test-only hack).
  await page.evaluate(async () => {
    const { clearTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    clearTodaySession();
  });
  // Same as the first sub-test: "오늘의 훈련" no longer auto-picks a
  // curriculum, so start this seeded wrestling curriculum's Day 1 explicitly
  // (exactly what the real "훈련하기" button does) instead of relying on a
  // "훈련 시작" button that would now start an unrelated ad_hoc/no_data plan.
  const curriculumId2 = await page.evaluate(async () => {
    const { listMyCurricula } = await import('/src/lib/curriculum/curriculumService.ts');
    return listMyCurricula().find((c) => c.martialArt === 'wrestling')?.id ?? null;
  });
  await page.evaluate(async (id) => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { startCurriculumDayTraining } = await import('/src/lib/todayTraining/sessionStore.ts');
    startCurriculumDayTraining(getCurriculum(id), 1);
  }, curriculumId2);
  await page.evaluate(() => {
    location.hash = '#/today-training';
  });
  await sleep(500);
  await page.fill('input[type=number]', '6');
  await page.click('button:has-text("세트 완료")');
  await sleep(300);
  const beforeClose = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session')));
  await device.app.close();

  device = await launchDevice(dirA);
  page = device.page;
  await page.evaluate(() => {
    location.hash = '#/today-training';
  });
  await sleep(600);
  const afterRelaunch = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session')));
  check(
    '[11] app restart recovers in-progress set state exactly (set 1 done with actualReps=6, rest timer intact)',
    afterRelaunch?.detail?.exercises?.[0]?.sets?.[0]?.actualReps === 6 &&
      afterRelaunch?.detail?.exercises?.[0]?.sets?.[0]?.completed === true &&
      afterRelaunch?.detail?.restTimer?.exerciseIndex === 0,
    JSON.stringify({ before: beforeClose?.detail?.restTimer, after: afterRelaunch?.detail })
  );
  const recoveredText = await page.evaluate(() => document.body.innerText);
  check('[11b] UI reflects the recovered state after restart (rest timer visible)', /휴식/.test(recoveredText), recoveredText.slice(0, 200));

  // ==================================================================
  // item 13/14: today's training also works from a fighter-style curriculum
  // (a completely normal Curriculum under the hood — see
  // styleCurriculumService.ts) using inferred defaults (no exerciseConfig set).
  // ==================================================================
  const styleResult = await page.evaluate(async () => {
    const { searchTechniques } = await import('/src/lib/search.ts');
    const { classifyPhase } = await import('/src/lib/fighterStyle/phaseClassifier.ts');
    const { getTechnique } = await import('/src/lib/loadData.ts');
    const { saveNewStyleCurriculum } = await import('/src/lib/fighterStyle/styleCurriculumService.ts');
    const { ensureProgress } = await import('/src/lib/curriculum/curriculumService.ts');

    const seen = new Map();
    for (const term of ['잽', '크로스', '훅']) for (const t of searchTechniques(term, 10)) if (!seen.has(t.id)) seen.set(t.id, t);
    const matches = [...seen.values()].map((t, i) => {
      const tech = getTechnique(t.id);
      return { techniqueId: t.id, techniqueName: t.name, martialArt: t.martialArt, relevanceScore: 90 - i, reason: 'qa', phase: tech ? classifyPhase(tech) : 'entries' };
    });
    const saved = saveNewStyleCurriculum({
      fighterId: 'qa-training-fighter',
      fighterName: 'QA훈련선수',
      styleAnalysis: { styleSummary: '', primaryStyles: [], keyTechniques: [], preferredPositions: [], offensiveConcepts: [], defensiveConcepts: [], distanceManagement: [], transitions: [] },
      matchedTechniques: matches,
      targetDays: 7,
      intensity: 'normal',
      userLevel: 'beginner',
      durationMode: 'user_selected',
    });
    ensureProgress(saved); // bumps lastStudiedAt to now -> becomes the active plan
    return { id: saved.id, dayTechniqueIds: saved.days[0]?.techniqueIds ?? [] };
  });
  check('[14 setup] fighter-style curriculum created with real matched techniques', styleResult.dayTechniqueIds.length > 0, JSON.stringify(styleResult));

  // ---- regression guard for the "커리큘럼은 루틴이 아니다" fix: even an
  // in-progress (ensureProgress'd) curriculum must NEVER be auto-picked by
  // generateTodayTrainingPlan() — only a configured gym routine or the
  // skill-based ad_hoc fallback may appear there now. ----
  const autoPlanCheck = await page.evaluate(async (styleId) => {
    const { generateTodayTrainingPlan } = await import('/src/lib/todayTraining/planner.ts');
    const plan = generateTodayTrainingPlan();
    return { mode: plan.mode, curriculumId: plan.curriculumId };
  }, styleResult.id);
  check(
    '[14] 오늘의 훈련 자동 계획은 진행 중인 커리큘럼을 절대 자동으로 선택하지 않음 (routine 전용)',
    autoPlanCheck.mode !== 'curriculum' && autoPlanCheck.curriculumId !== styleResult.id,
    JSON.stringify(autoPlanCheck)
  );

  // The curriculum is still fully usable via the explicit "훈련하기" path —
  // buildTrainingPlanForCurriculumDay(), the exact function that button calls.
  const styleSessionCheck = await page.evaluate(async (styleId) => {
    const { startTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    const { buildTrainingPlanForCurriculumDay } = await import('/src/lib/todayTraining/planner.ts');
    const { ensureSessionDetail } = await import('/src/lib/todayTraining/sessionDetail.ts');
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const curriculum = getCurriculum(styleId);
    const plan = buildTrainingPlanForCurriculumDay(curriculum, 1);
    if (!plan || plan.curriculumId !== styleId) return { ok: false, plan };
    const session = startTodaySession(plan);
    const withDetail = ensureSessionDetail(session, curriculum);
    return { ok: true, exerciseCount: withDetail.detail.exercises.length, firstConfig: withDetail.detail.exercises[0]?.config };
  }, styleResult.id);
  check(
    '[14b] a fighter-style curriculum, started explicitly via 훈련하기, builds a full set/rep/time runtime using inferred defaults (no exerciseConfig authored)',
    styleSessionCheck.ok && styleSessionCheck.exerciseCount > 0 && !!styleSessionCheck.firstConfig?.mode,
    JSON.stringify(styleSessionCheck)
  );

  // ---- item 15 (spot regression): technique catalog untouched, curriculum CRUD still works ----
  const regressionCheck = await page.evaluate(async () => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    return { techniqueCount: allTechniques.length };
  });
  check('[15] technique catalog still has all 1284 techniques (untouched by this feature)', regressionCheck.techniqueCount === 1284, JSON.stringify(regressionCheck));
  check('[15b] no console/page errors accumulated across the whole run', device.consoleErrors.length === 0, JSON.stringify(device.consoleErrors));

  await device.app.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
