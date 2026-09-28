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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-gym-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  // ---- 1. Empty state: /training with no data ----
  await page.evaluate(() => { location.hash = '#/training'; });
  await sleep(700);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[1][빈 상태] /training 크래시 없이 렌더', bodyText.includes('훈련') && !bodyText.includes('undefined') && !bodyText.includes('NaN'), bodyText.slice(0, 200));
  check('[1b][빈 상태] 오늘 볼륨 0kg로 표시 (NaN 없음)', bodyText.includes('0kg'), '');

  // ---- 2. Seed a today-weekday gym routine + past gym training-history entries with weight/RPE ----
  const seeded = await page.evaluate(async () => {
    const { createGymRoutine, addExerciseToDay, setActiveGymRoutine } = await import('/src/lib/gymRoutine/service.ts');
    const { getKstWeekday } = await import('/src/lib/dateUtil.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');

    const todayWeekday = getKstWeekday();
    let routine = createGymRoutine('QA 루틴');
    routine = addExerciseToDay(routine, todayWeekday, {
      techniqueId: 'gym-벤치프레스',
      targetSets: 3,
      targetReps: [10, 10, 10],
      targetSeconds: null,
      targetWeightKg: 60,
      restSeconds: 90,
    });
    setActiveGymRoutine(routine.id);

    // A completed gym session today: 3 sets of bench press, weight+reps+RPE recorded.
    const todayEntry = recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: ['gym-벤치프레스'],
      completed: true,
      estimatedMinutes: 15,
      actualMinutes: 15,
      notes: null,
      source: 'coach_today',
      exerciseDetails: [
        {
          techniqueId: 'gym-벤치프레스',
          mode: 'reps',
          sets: 3,
          targetReps: 10,
          targetSeconds: null,
          actualReps: [10, 10, 8],
          actualSeconds: [null, null, null],
          restSeconds: 90,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          actualWeightKg: [60, 60, 60],
          actualRpe: [7, 7, 8],
          weightUnit: 'kg',
        },
      ],
    });

    return { routineId: routine.id, todayEntryId: todayEntry.id, todayWeekday };
  });
  check('[2][seed] 루틴 + 세트 기록(중량/RPE) 저장', !!seeded.routineId && !!seeded.todayEntryId, JSON.stringify(seeded));

  // ---- 3. /training reflects seeded volume ----
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(150);
  await page.evaluate(() => { location.hash = '#/training'; });
  await page.waitForFunction(() => document.body.innerText.includes('QA 루틴') || document.body.innerText.includes('벤치프레스'), { timeout: 5000 }).catch(() => {});
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  // volume = 60*10 + 60*10 + 60*8 = 1680kg -> formatVolumeCompact renders >=1000kg as tonnes ("1.7t")
  check('[3][오늘 볼륨] 1680kg = 1.7t로 정확히 계산됨 (60kg×10 + 60kg×10 + 60kg×8)', bodyText.includes('1.7t'), bodyText.match(/[\d.,]+(kg|t)/g)?.join(',') ?? 'no volume found');
  check('[3b][오늘의 훈련] 활성 루틴이 오늘의 훈련에 반영됨', bodyText.includes('QA 루틴') || bodyText.includes('1개 운동') || /\d+개 운동/.test(bodyText), bodyText.slice(0, 300));
  check('[3c][성장률] NaN/Infinity/undefined 없음', !/NaN|Infinity|undefined/.test(bodyText), '');
  check('[3d][회복도] 12개 부위 그리드 렌더', (bodyText.match(/%/g) ?? []).length >= 12, '');
  check('[3e][달력] 훈련 캘린더 섹션 렌더', bodyText.includes('년') && bodyText.includes('월'), '');

  // ---- 4. Growth rate with zero previous period never shows Infinity/NaN ----
  const growthCheck = await page.evaluate(async () => {
    const { computeGrowthRatePercent } = await import('/src/lib/gymTraining/growthRate.ts');
    return {
      zeroPrev: computeGrowthRatePercent(500, 0),
      negativePrev: computeGrowthRatePercent(500, -10),
      normal: computeGrowthRatePercent(48320, 41000),
      bothZero: computeGrowthRatePercent(0, 0),
    };
  });
  check(
    '[4][성장률 가드] previous<=0 → 0%, 정상 케이스는 올바른 %',
    growthCheck.zeroPrev === 0 && growthCheck.negativePrev === 0 && growthCheck.bothZero === 0 && Math.abs(growthCheck.normal - 17.9) < 0.2,
    JSON.stringify(growthCheck)
  );

  // ---- 5. Recovery is always clamped 0-100 ----
  const recoveryCheck = await page.evaluate(async () => {
    const { computeAllBodyPartRecovery } = await import('/src/lib/gymTraining/recovery.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const recovery = computeAllBodyPartRecovery(listTrainingHistory());
    return recovery.map((r) => ({ bodyPart: r.bodyPart, pct: r.recoveryPercent, status: r.status }));
  });
  const allClamped = recoveryCheck.every((r) => r.pct >= 0 && r.pct <= 100 && Number.isFinite(r.pct));
  check('[5][회복도 클램프] 모든 부위 0-100% 범위 내, 유한값', allClamped, JSON.stringify(recoveryCheck));
  const chestEntry = recoveryCheck.find((r) => r.bodyPart === 'chest');
  check('[5b][회복도] 가슴은 방금 훈련해서 recovering 상태', chestEntry?.status === 'recovering', JSON.stringify(chestEntry));

  // ---- 6. Exercise browser: search + record lookup ----
  await page.evaluate(() => { location.hash = '#/training/exercises'; });
  await sleep(500);
  const searchInput = await page.$('input[placeholder="운동 이름으로 검색"]');
  if (searchInput) await searchInput.fill('벤치프레스');
  await sleep(400);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[6][운동 목록] 검색 시 벤치프레스가 나타남', bodyText.includes('벤치프레스'), '');
  // Exact-name match (the substring query also matches "덤벨 벤치프레스" etc.) —
  // click the row whose name is precisely "벤치프레스".
  const clickedExact = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('.technique-row__name'));
    const exact = names.find((el) => el.textContent === '벤치프레스');
    if (!exact) return false;
    exact.closest('button')?.click();
    return true;
  });
  check('[6a][운동 목록] 정확히 "벤치프레스" 행 클릭', clickedExact, '');
  await sleep(400);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[6b][운동 상세] 최근 기록 표시 (60kg×10 형태)', bodyText.includes('60kg') && bodyText.includes('×'), bodyText.slice(bodyText.indexOf('벤치프레스'), bodyText.indexOf('벤치프레스') + 300));
  check('[6c][운동 상세] 누적 볼륨 통계 표시', bodyText.includes('누적 볼륨'), '');

  // ---- 7. Picker never renders unfiltered full list ----
  await page.evaluate(() => { location.hash = '#/training/exercises'; });
  await sleep(300);
  await page.evaluate(() => { location.reload(); });
  await sleep(1000);
  const rowCountBeforeFilter = await page.evaluate(() => document.querySelectorAll('button.technique-row').length);
  check('[7][성능] 필터 없이는 운동 행이 0개 렌더', rowCountBeforeFilter === 0, `rows=${rowCountBeforeFilter}`);

  // ---- 8. Routine manager shows created routine as active ----
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(200);
  await page.evaluate(() => { location.hash = '#/training/routines'; });
  await page.waitForFunction(() => document.body.innerText.includes('QA 루틴'), { timeout: 5000 }).catch(() => {});
  await sleep(300);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[8][루틴 관리] QA 루틴이 활성 상태로 표시', bodyText.includes('QA 루틴') && bodyText.includes('활성'), bodyText.slice(0, 300));

  // ---- 9. Body part detail page ----
  await page.evaluate(() => { location.hash = '#/training/body/chest'; });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[9][부위 상세] 가슴 회복도 페이지 렌더, %표시', /\d+%/.test(bodyText) && bodyText.includes('가슴'), bodyText.slice(0, 200));
  check('[9b][부위 상세] 비의료 고지 문구 표시', bodyText.includes('의학적 판단이 아닌'), '');

  // ---- 10. Training history list distinguishes gym entries ----
  await page.evaluate(() => { location.hash = '#/training-analytics/history'; });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[10][훈련 기록] 웨이트 필터 옵션 존재', bodyText.includes('웨이트'), '');

  // ---- 11. Mobile viewport: no horizontal overflow on /training ----
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => { location.hash = '#/training'; });
  await sleep(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('[11][모바일] /training 가로 스크롤 없음', overflow <= 1, `overflow=${overflow}px`);
  await page.setViewportSize({ width: 1280, height: 900 });

  // ---- 12. Existing 1284-technique catalog & official techniques untouched ----
  const catalogCheck = await page.evaluate(async () => {
    const { allTechniques, gymExercises, homeTrainingExercises } = await import('/src/lib/loadData.ts');
    return { officialCount: allTechniques.length, gymCount: gymExercises.length, homeCount: homeTrainingExercises.length };
  });
  check('[12][회귀] allTechniques는 여전히 1284개 (헬스 운동 섞이지 않음)', catalogCheck.officialCount === 1284, JSON.stringify(catalogCheck));
  check('[12b][회귀] 헬스 운동은 정확히 147개', catalogCheck.gymCount === 147, JSON.stringify(catalogCheck));

  // ---- 13. kg/lbs conversion round-trips correctly ----
  const unitCheck = await page.evaluate(async () => {
    const { toKg, toDisplayUnit } = await import('/src/lib/gymTraining/volume.ts');
    const kgFromLbs = toKg(100, 'lbs'); // ~45.36kg
    const lbsFromKg = toDisplayUnit(100, 'lbs'); // ~220.46lbs
    const roundTrip = toDisplayUnit(toKg(225, 'lbs'), 'lbs');
    return { kgFromLbs, lbsFromKg, roundTrip };
  });
  check(
    '[13][단위 변환] kg<->lbs 변환이 정확하고 왕복 시 원래 값 유지',
    Math.abs(unitCheck.kgFromLbs - 45.36) < 0.01 && Math.abs(unitCheck.lbsFromKg - 220.46) < 0.01 && Math.abs(unitCheck.roundTrip - 225) < 0.001,
    JSON.stringify(unitCheck)
  );

  // ---- 14. Reordering exercises within a routine day (splice-based ▲▼) ----
  const reorderCheck = await page.evaluate(async () => {
    const { createGymRoutine, addExerciseToDay, reorderExercise } = await import('/src/lib/gymRoutine/service.ts');
    let r = createGymRoutine('QA 재정렬 루틴');
    r = addExerciseToDay(r, 1, { techniqueId: 'gym-a', targetSets: 3, targetReps: [10, 10, 10], targetSeconds: null, targetWeightKg: null, restSeconds: 60 });
    r = addExerciseToDay(r, 1, { techniqueId: 'gym-b', targetSets: 3, targetReps: [10, 10, 10], targetSeconds: null, targetWeightKg: null, restSeconds: 60 });
    r = addExerciseToDay(r, 1, { techniqueId: 'gym-c', targetSets: 3, targetReps: [10, 10, 10], targetSeconds: null, targetWeightKg: null, restSeconds: 60 });
    const before = r.days.find((d) => d.weekday === 1).exercises.map((e) => e.techniqueId);
    r = reorderExercise(r, 1, 0, 2); // move first ('gym-a') to the end
    const after = r.days.find((d) => d.weekday === 1).exercises.map((e) => e.techniqueId);
    return { before, after };
  });
  check(
    '[14][루틴 재정렬] ▲▼ 이동이 순서를 정확히 변경 (a,b,c -> b,c,a)',
    JSON.stringify(reorderCheck.before) === '["gym-a","gym-b","gym-c"]' && JSON.stringify(reorderCheck.after) === '["gym-b","gym-c","gym-a"]',
    JSON.stringify(reorderCheck)
  );

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
