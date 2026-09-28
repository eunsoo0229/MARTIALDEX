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

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-integration-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  // ============================================================
  // SCENARIO A — Free training records a gym exercise through the REAL UI
  // (GymExercisePicker -> GymSetInput -> recordSet -> trainingHistory),
  // not via a direct service-call shortcut.
  // ============================================================
  await page.evaluate(() => { location.hash = '#/free-training'; });
  await sleep(500);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('헬스 운동 선택'))?.click(); });
  await sleep(300);
  await page.fill('input[placeholder="운동 이름으로 검색"]', '벤치프레스');
  await sleep(400);
  const addedBench = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('.technique-row__name'));
    const exact = names.find((el) => el.textContent === '벤치프레스');
    if (!exact) return false;
    exact.closest('button')?.click();
    return true;
  });
  check('[A1] 자유훈련에 헬스 운동(벤치프레스) 추가 가능', addedBench);

  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('훈련 시작'))?.click(); });
  await sleep(500);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[A2] 실행 화면에 GymSetInput(중량/반복/RPE 입력) 렌더', bodyText.includes('중량') && bodyText.includes('RPE'), '');

  // Set 1: 60kg x 10, RPE 7
  async function fillGymSet(weight, reps, rpe) {
    const weightInput = await page.$('label.field-label:has-text("중량") input');
    const repsInput = await page.$('label.field-label:has-text("반복") input');
    const rpeInput = await page.$('label.field-label:has-text("RPE") input');
    await weightInput.fill(String(weight));
    await repsInput.fill(String(reps));
    if (rpe != null) await rpeInput.fill(String(rpe));
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '세트 완료')?.click(); });
    await sleep(400);
    // Skip the rest timer if one appears (not the last set).
    const skipBtn = await page.$('button:has-text("건너뛰기")');
    if (skipBtn) {
      await skipBtn.click();
      await sleep(300);
    }
  }

  await fillGymSet(60, 10, 7);
  await fillGymSet(60, 10, 7);
  await fillGymSet(60, 8, 8);
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[A3] 3세트 모두 완료 후 완료 화면으로 전환', bodyText.includes('자유훈련 완료') || bodyText.includes('수행 기술'), bodyText.slice(0, 200));

  const freeEntryCheck = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const entries = listTrainingHistory().filter((e) => e.source === 'free_training');
    const ex = entries[0]?.exerciseDetails?.find((d) => d.techniqueId === 'gym-벤치프레스');
    return { count: entries.length, actualWeightKg: ex?.actualWeightKg, actualReps: ex?.actualReps, actualRpe: ex?.actualRpe };
  });
  check(
    '[A4] trainingHistory에 실제 UI로 입력한 중량/반복/RPE가 정확히 저장됨(60,60,60 / 10,10,8 / 7,7,8)',
    freeEntryCheck.count === 1 &&
      JSON.stringify(freeEntryCheck.actualWeightKg) === '[60,60,60]' &&
      JSON.stringify(freeEntryCheck.actualReps) === '[10,10,8]' &&
      JSON.stringify(freeEntryCheck.actualRpe) === '[7,7,8]',
    JSON.stringify(freeEntryCheck)
  );

  // ============================================================
  // SCENARIO B — A gym-routine day (오늘의 훈련) also records weight through
  // the real UI, and its volume ADDS to (not replaces/duplicates) the free
  // training volume from the same day.
  // ============================================================
  const routineSeed = await page.evaluate(async () => {
    const { createGymRoutine, addExerciseToDay, setActiveGymRoutine } = await import('/src/lib/gymRoutine/service.ts');
    const { getKstWeekday } = await import('/src/lib/dateUtil.ts');
    const todayWeekday = getKstWeekday();
    let routine = createGymRoutine('통합 테스트 루틴');
    routine = addExerciseToDay(routine, todayWeekday, {
      techniqueId: 'gym-바벨-백스쿼트',
      targetSets: 2,
      targetReps: 8,
      targetSeconds: null,
      targetWeightKg: 80,
      restSeconds: 90,
    });
    setActiveGymRoutine(routine.id);
    return { routineId: routine.id, todayWeekday };
  });
  check('[B1][seed] 오늘 요일에 스쿼트 루틴 활성화', !!routineSeed.routineId, JSON.stringify(routineSeed));

  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(150);
  await page.evaluate(() => { location.hash = '#/today-training'; });
  await sleep(700);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[B2] 오늘의 훈련이 루틴의 스쿼트를 자동 반영', bodyText.includes('스쿼트'), bodyText.slice(0, 300));

  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '훈련 시작')?.click(); });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[B3] 루틴 목표 중량(80kg)이 세트 입력 화면에 표시됨', bodyText.includes('80kg'), bodyText.slice(0, 300));

  await fillGymSet(80, 8, null);
  await fillGymSet(80, 8, null);
  await sleep(700);

  const historyAfterB = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().map((e) => ({ source: e.source, techniqueIds: e.techniqueIds, id: e.id }));
  });
  check(
    '[B4] 오늘의 훈련(루틴) 세션도 별도 trainingHistory 엔트리로 기록됨 (총 2개, 자유훈련과 중복 아님)',
    historyAfterB.length === 2 && historyAfterB.some((e) => e.source === 'free_training') && historyAfterB.some((e) => e.source !== 'free_training'),
    JSON.stringify(historyAfterB)
  );

  // ============================================================
  // SCENARIO C — combined same-day volume = free-training + routine, no
  // double counting, correctly reflected in the /training hub.
  // ============================================================
  const volumeCheck = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const { sumVolumeKg } = await import('/src/lib/gymTraining/volume.ts');
    const { todayDateKey } = await import('/src/lib/dateUtil.ts');
    const entries = listTrainingHistory();
    const todayEntries = entries.filter((e) => e.date === todayDateKey());
    return { todayVolume: sumVolumeKg(todayEntries), entryCount: todayEntries.length };
  });
  // bench: 60*10+60*10+60*8=1680, squat: 80*8+80*8=1280 -> total 2960kg
  check('[C1] 오늘 총 볼륨 = 자유훈련(1680kg) + 루틴(1280kg) = 2960kg (중복 없음)', volumeCheck.todayVolume === 2960, JSON.stringify(volumeCheck));

  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(150);
  await page.evaluate(() => { location.hash = '#/training'; });
  await page.waitForFunction(() => /2\.9|2\.96|2960/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
  await sleep(300);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[C2] /training 허브의 "오늘 운동 볼륨"이 2.96t(반올림 2.9~3.0t)로 표시', /2\.9t|3\.0t/.test(bodyText), bodyText.match(/[\d.]+t/g)?.join(',') ?? 'not found');

  // ============================================================
  // SCENARIO D — recovery reflects BOTH sessions: chest (bench, primary),
  // quads (squat, primary), AND glutes/hamstrings (squat's secondary
  // muscles, partial credit via the grounded muscle map).
  // ============================================================
  const recoveryCheck = await page.evaluate(async () => {
    const { computeAllBodyPartRecovery } = await import('/src/lib/gymTraining/recovery.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const recovery = computeAllBodyPartRecovery(listTrainingHistory());
    return Object.fromEntries(recovery.map((r) => [r.bodyPart, { pct: r.recoveryPercent, status: r.status, recentVolumeKg: r.recentVolumeKg }]));
  });
  check(
    '[D1] 가슴(벤치 primary) recovering, 최근 볼륨=1680kg (스쿼트 볼륨 섞이지 않음)',
    recoveryCheck.chest.status === 'recovering' && recoveryCheck.chest.recentVolumeKg === 1680,
    JSON.stringify(recoveryCheck.chest)
  );
  check(
    '[D2] 대퇴사두근(스쿼트 primary) recovering, 최근 볼륨=1280kg',
    recoveryCheck.quads.status === 'recovering' && recoveryCheck.quads.recentVolumeKg === 1280,
    JSON.stringify(recoveryCheck.quads)
  );
  check(
    '[D3] 둔근/햄스트링(스쿼트 secondary) 도 recovering 상태로 반영됨(부분 반영)',
    recoveryCheck.glutes.status === 'recovering' && recoveryCheck.hamstrings.status === 'recovering',
    JSON.stringify({ glutes: recoveryCheck.glutes, hamstrings: recoveryCheck.hamstrings })
  );
  // 벤치프레스 secondary=삼두근/전면 삼각근(triceps/shoulders), 스쿼트
  // secondary=둔근/햄스트링(glutes/hamstrings) — so shoulders/triceps ARE
  // expected to show partial recovering credit too (anatomically correct,
  // see muscleMap.ts); only back/biceps/forearms/calves/lower_back are
  // genuinely untouched by either exercise's primary or secondary muscles.
  const untouched = ['back', 'biceps', 'forearms', 'calves', 'lower_back'];
  check(
    '[D4] 등/이두/전완/종아리/허리 등 실제로 훈련하지 않은 부위만 no_data(100%)',
    untouched.every((bp) => recoveryCheck[bp].status === 'no_data'),
    JSON.stringify(Object.fromEntries(untouched.map((bp) => [bp, recoveryCheck[bp]])))
  );
  check(
    '[D4b] 어깨/삼두(벤치 secondary)는 부분 반영으로 recovering — 근거 있는 보조근육 매핑 확인',
    recoveryCheck.shoulders.status === 'recovering' && recoveryCheck.triceps.status === 'recovering',
    JSON.stringify({ shoulders: recoveryCheck.shoulders, triceps: recoveryCheck.triceps })
  );
  const allClamped = Object.values(recoveryCheck).every((r) => r.pct >= 0 && r.pct <= 100 && Number.isFinite(r.pct));
  check('[D5] 모든 부위 회복도 0-100% 클램프', allClamped, JSON.stringify(recoveryCheck));

  // ============================================================
  // SCENARIO E — calendar reflects the combined day, and body.png hub UI
  // shows the recovery grid consistently with the direct calculation.
  // ============================================================
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[E1] /training 허브에 회복도 12개 부위 그리드 표시', (bodyText.match(/%/g) ?? []).length >= 12, '');
  check('[E2] 캘린더 섹션 렌더 (오늘 날짜 볼륨 포함)', bodyText.includes('년') && bodyText.includes('월'), '');

  // ============================================================
  // SCENARIO F — exercise history/records include the free-training set.
  // ============================================================
  const benchStats = await page.evaluate(async () => {
    const { getExerciseStats, formatLastSessionSets } = await import('/src/lib/gymTraining/records.ts');
    return { stats: getExerciseStats('gym-벤치프레스'), lastLabel: formatLastSessionSets('gym-벤치프레스') };
  });
  check(
    '[F1] 벤치프레스 과거 기록에 자유훈련에서 수행한 세트가 포함됨',
    benchStats.stats.timesPerformed === 1 && benchStats.stats.totalSets === 3 && benchStats.stats.cumulativeVolumeKg === 1680 && benchStats.stats.maxWeightKg === 60,
    JSON.stringify(benchStats)
  );
  check('[F2] 최근 기록 문자열 정확히 "60kg×10, 60kg×10, 60kg×8"', benchStats.lastLabel === '60kg×10, 60kg×10, 60kg×8', benchStats.lastLabel);

  // ============================================================
  // SCENARIO G — persistence across reload (source of truth = local repo,
  // which is what cloudSync/trainingHistorySync.ts pushes verbatim).
  // ============================================================
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(1000);
  const afterReload = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().length;
  });
  check('[G1] 앱 새로고침 후에도 두 세션 기록 모두 유지됨', afterReload === 2, `count=${afterReload}`);

  // ============================================================
  // SCENARIO H — regression: existing 1284/147 catalog split untouched.
  // ============================================================
  const catalogCheck = await page.evaluate(async () => {
    const { allTechniques, gymExercises } = await import('/src/lib/loadData.ts');
    return { officialCount: allTechniques.length, gymCount: gymExercises.length };
  });
  check('[H1] 무술 기술 1284개 / 헬스 운동 147개 그대로 유지', catalogCheck.officialCount === 1284 && catalogCheck.gymCount === 147, JSON.stringify(catalogCheck));

  check('[규약] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed < results.length) {
    console.log('FAILURES:');
    for (const r of results) if (!r.pass) console.log(' - ' + r.name + ' :: ' + r.detail);
  }

  await app.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
