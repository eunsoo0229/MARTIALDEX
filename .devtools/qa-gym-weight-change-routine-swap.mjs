// QA: 중량 변화율 (지난 운동/지난주/지난달) + 다른 요일 루틴으로 운동하기.
// Requires the Vite dev server on :5173 (npm run dev:vite).
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const SHOT_DIR = process.env.SHOT_DIR;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !pass ? ' :: ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(dir) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(800);
  return { app, page };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-gym-cmp-'));
  let { app, page } = await launch(dir);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await sleep(700);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const shot = async (name) => SHOT_DIR && page.screenshot({ path: path.join(SHOT_DIR, name + '.png'), fullPage: true });

  // ===================== A. 변화율 로직 =====================
  const logic = await page.evaluate(async () => {
    const cmp = await import('/src/lib/gymTraining/weightComparison.ts');
    const { shiftDateKeyDays, shiftDateKeyMonths } = await import('/src/lib/dateUtil.ts');
    const today = '2026-10-05';
    const mk = (id, date, weights, opts = {}) => ({
      id,
      date,
      completedAt: date + 'T10:00:00.000Z',
      curriculumId: null,
      dayNumber: null,
      techniqueIds: ['gym-바벨-백스쿼트'],
      completed: opts.completed ?? true,
      estimatedMinutes: 10,
      actualMinutes: 10,
      notes: null,
      source: 'coach_today',
      exerciseDetails: [
        {
          techniqueId: opts.techniqueId ?? 'gym-바벨-백스쿼트',
          mode: 'reps',
          sets: weights?.length ?? 3,
          targetReps: 8,
          targetSeconds: null,
          actualReps: (weights ?? [null, null, null]).map((w) => (opts.repsOnly ? 8 : w == null ? null : 8)),
          actualSeconds: [null, null, null],
          restSeconds: 90,
          startedAt: null,
          finishedAt: null,
          ...(weights ? { actualWeightKg: weights } : {}),
          ...(opts.legacy || !weights ? {} : { actualCalculatedWeightKg: weights }),
          ...(opts.calcType ? { weightCalcType: opts.calcType } : {}),
        },
      ],
    });
    const base = (entries, calcType) => cmp.findWeightBaselines(cmp.listPastWeightRecords('gym-바벨-백스쿼트', calcType, entries), today);
    const pick = (b) => ({ s: b.lastSession?.date ?? null, w: b.lastWeek?.date ?? null, m: b.lastMonth?.date ?? null });

    const out = {};
    out.none = pick(base([]));
    out.onlyLast = pick(base([mk('a', '2026-10-03', [95, 95, 90])]));
    out.week = pick(base([mk('b', '2026-09-27', [90, 90, 85])]));
    out.month = pick(base([mk('c', '2026-09-02', [85, 85, 80])]));
    const all = [mk('a', '2026-10-03', [95, 95, 90]), mk('b', '2026-09-27', [90, 90, 85]), mk('c', '2026-09-02', [85, 85, 80])];
    const b = base(all);
    out.all = pick(b);
    out.pctLast = cmp.compareLoad(100, b.lastSession, 0);
    out.pctWeek = cmp.compareLoad(100, b.lastWeek, 0);
    out.pctMonth = cmp.compareLoad(100, b.lastMonth, 0);
    out.fmtUp = cmp.formatChangePercent(cmp.compareLoad(100, b.lastSession, 0).percent);
    out.fmtDown = cmp.formatChangePercent(cmp.compareLoad(90, b.lastSession, 0).percent);
    out.fmtSame = cmp.formatChangePercent(cmp.compareLoad(95, b.lastSession, 0).percent);
    // Per set: set 3 (index 2) was 90 last time → 95 now = +5.6%; set 4 didn't exist → top set (95).
    out.perSet = cmp.compareLoad(95, b.lastSession, 2);
    out.missingSet = cmp.compareLoad(100, b.lastSession, 3);
    out.noCurrent = cmp.compareLoad(null, b.lastSession, 0);
    out.legacy = pick(base([mk('l', '2026-10-01', [70, 70, 70], { legacy: true })]));
    out.repsOnly = pick(base([mk('r', '2026-10-01', null, { repsOnly: true })]));
    out.otherCalcType = pick(base([mk('d', '2026-10-01', [40, 40], { calcType: 'dumbbell' })]));
    out.incomplete = pick(base([mk('i', '2026-10-01', [70, 70], { completed: false })]));
    out.otherExercise = pick(base([mk('o', '2026-10-01', [70], { techniqueId: 'gym-레그-프레스' })]));
    out.tooOld = pick(base([mk('t', '2026-06-01', [60, 60])]));
    out.bodyweight = cmp.supportsWeightComparison('bodyweight');
    out.dumbbellOk = cmp.supportsWeightComparison('dumbbell');
    out.shift = [shiftDateKeyDays('2026-03-01', -1), shiftDateKeyMonths('2026-03-31', -1), shiftDateKeyMonths('2026-01-15', -1)];
    return out;
  });
  check('[A1] 과거 기록 없음 → 비교값 없음', JSON.stringify(logic.none) === '{"s":null,"w":null,"m":null}', JSON.stringify(logic.none));
  check('[A2] 지난 운동 기록만 있음', logic.onlyLast.s === '2026-10-03' && !logic.onlyLast.w && !logic.onlyLast.m, JSON.stringify(logic.onlyLast));
  check('[A3] 지난주 기록 (8일 전) → 지난주 매칭', logic.week.w === '2026-09-27' && !logic.week.m, JSON.stringify(logic.week));
  check('[A4] 지난달 기록 (33일 전) → 지난달 매칭', logic.month.m === '2026-09-02' && !logic.month.w, JSON.stringify(logic.month));
  check('[A5] 모든 기록 있음', logic.all.s === '2026-10-03' && logic.all.w === '2026-09-27' && logic.all.m === '2026-09-02', JSON.stringify(logic.all));
  check('[A6] 계산식 100 vs 95/90/85 = +5.3/+11.1/+17.6', logic.pctLast.percent === 5.3 && logic.pctWeek.percent === 11.1 && logic.pctMonth.percent === 17.6, JSON.stringify([logic.pctLast, logic.pctWeek, logic.pctMonth]));
  check('[A7] 증가 표시 ▲ +5.3%', logic.fmtUp === '▲ +5.3%', logic.fmtUp);
  check('[A8] 감소 표시 ▼ -5.3%', logic.fmtDown === '▼ -5.3%', logic.fmtDown);
  check('[A9] 동일 표시 — 0%', logic.fmtSame === '— 0%', logic.fmtSame);
  check('[A10] 세트별 비교 (3세트 90→95 = +5.6%, basis=set)', logic.perSet.percent === 5.6 && logic.perSet.basis === 'set' && logic.perSet.previousKg === 90, JSON.stringify(logic.perSet));
  check('[A11] 과거에 없던 세트 → 최고 세트 기준', logic.missingSet.basis === 'top' && logic.missingSet.previousKg === 95, JSON.stringify(logic.missingSet));
  check('[A12] 현재 중량 미입력 → 변화율 계산 안 함', logic.noCurrent === null, JSON.stringify(logic.noCurrent));
  check('[A13] 오래된(레거시) 기록: actualWeightKg만 있어도 비교', logic.legacy.s === '2026-10-01', JSON.stringify(logic.legacy));
  check('[A14] 횟수만 기록된 운동은 제외', logic.repsOnly.s === null, JSON.stringify(logic.repsOnly));
  check('[A15] 계산 방식(단위)이 다른 기록은 비교 안 함', logic.otherCalcType.s === null, JSON.stringify(logic.otherCalcType));
  check('[A16] 미완료 기록은 제외', logic.incomplete.s === null, JSON.stringify(logic.incomplete));
  check('[A17] 다른 운동 기록은 섞이지 않음', logic.otherExercise.s === null, JSON.stringify(logic.otherExercise));
  check('[A18] 너무 오래된 기록은 지난주/지난달로 표시 안 함 (지난 운동만)', logic.tooOld.s === '2026-06-01' && !logic.tooOld.w && !logic.tooOld.m, JSON.stringify(logic.tooOld));
  check('[A19] 맨몸(체중) 운동은 중량 변화율 미표시', logic.bodyweight === false && logic.dumbbellOk === true, '');
  check('[A20] 날짜 시프트 (월말 클램프 포함)', JSON.stringify(logic.shift) === '["2026-02-28","2026-02-28","2025-12-15"]', JSON.stringify(logic.shift));

  // ===================== B. 루틴 시드 =====================
  const seed = await page.evaluate(async () => {
    const svc = await import('/src/lib/gymRoutine/service.ts');
    const { getKstWeekday, todayDateKey, shiftDateKeyDays } = await import('/src/lib/dateUtil.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const today = getKstWeekday();
    const other = (((today - 1 + 2) % 7) + 1);
    let r = svc.createGymRoutine('QA 분할 루틴');
    r = svc.addExerciseToDay(r, today, { techniqueId: 'gym-벤치프레스', targetSets: 3, targetReps: [10, 10, 10], targetSeconds: null, targetWeightKg: [60, 60, 60], restSeconds: 90 });
    r = svc.addExerciseToDay(r, other, { techniqueId: 'gym-바벨-백스쿼트', targetSets: 2, targetReps: [8, 6], targetSeconds: null, targetWeightKg: [100, 105], restSeconds: 45 });
    r = svc.addExerciseToDay(r, other, { techniqueId: 'gym-레그-프레스', targetSets: 1, targetReps: [12], targetSeconds: null, targetWeightKg: [null], restSeconds: 60 });
    svc.setActiveGymRoutine(r.id);
    // Past squat sessions: last session 2 days ago, last week (7 days ago), last month (31 days ago).
    const past = [
      [2, [95, 95]],
      [7, [90, 90]],
      [31, [85, 85]],
    ];
    for (const [ago, w] of past) {
      recordTrainingSession({
        date: shiftDateKeyDays(todayDateKey(), -ago),
        curriculumId: null, dayNumber: null, techniqueIds: ['gym-바벨-백스쿼트'], completed: true, estimatedMinutes: 10, actualMinutes: 10, source: 'coach_today',
        exerciseDetails: [{ techniqueId: 'gym-바벨-백스쿼트', mode: 'reps', sets: 2, targetReps: 8, targetSeconds: null, actualReps: [8, 8], actualSeconds: [null, null], restSeconds: 90, startedAt: null, finishedAt: null, actualWeightKg: w, actualCalculatedWeightKg: w }],
      });
    }
    return { routineId: r.id, today, other, before: localStorage.getItem('martialdex:gym-routines') };
  });
  const WD = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' };
  const otherLabel = WD[seed.other] + '요일';

  // ===================== C. 오늘 루틴 화면 + 다른 요일 루틴 선택 =====================
  await goto('#/today-training');
  let t = await text();
  check('[C1] 오늘 루틴(벤치프레스)이 기본으로 표시', t.includes('벤치프레스') && !t.includes('바벨 백스쿼트'), t.slice(0, 400));
  check('[C2] "다른 요일 루틴으로 운동하기" 버튼 노출', t.includes('다른 요일 루틴으로 운동하기'));
  await page.locator('button:has-text("다른 요일 루틴으로 운동하기")').click();
  await sleep(400);
  t = await text();
  check('[C3] 요일 선택 시트 표시', t.includes('어떤 루틴으로 오늘 운동할까요?') && t.includes('월요일') && t.includes('일요일'));
  await page.locator(`.modal-panel--sheet button:has-text("${otherLabel}")`).click();
  await sleep(300);
  t = await text();
  check('[C4] 선택 요일 루틴 미리보기 (운동/세트/반복/중량/휴식)', t.includes('바벨 백스쿼트') && t.includes('2세트 × 8/6회 · 100/105kg') && t.includes('휴식 45초') && t.includes('레그 프레스'), t.slice(-600));
  await shot('c4-picker');
  await page.locator('.modal-panel--sheet button:has-text("이 루틴으로 운동 시작")').click();
  await sleep(800);
  t = await text();
  check('[C5] 세션 시작: "불러온 루틴: X요일" + 첫 운동 스쿼트', t.includes(`불러온 루틴: ${otherLabel}`) && t.includes('바벨 백스쿼트'), t.slice(0, 500));
  check('[C6] 순서/세트 수 그대로 (1/2, SET 1 / 2)', t.includes('1/2') && t.includes('SET 1 / 2'));

  // ===================== D. 중량 변화율 UI =====================
  const weightInput = page.locator('.gym-set-input label:has-text("중량") input');
  check('[D1] 목표 중량 prefill = 루틴의 1세트 100kg', (await weightInput.inputValue()) === '100');
  t = await text();
  check('[D2] 지난 운동 95kg ▲ +5.3%', /▲ \+5\.3%\s*지난 운동\s*95kg/.test(t), t.slice(0, 900));
  check('[D3] 지난주 90kg ▲ +11.1%', /▲ \+11\.1%\s*지난주\s*90kg/.test(t));
  check('[D4] 지난달 85kg ▲ +17.6%', /▲ \+17\.6%\s*지난달\s*85kg/.test(t));
  await shot('d-compare');
  await weightInput.fill('90');
  await sleep(150);
  t = await text();
  check('[D5] 입력 변경 시 즉시 재계산 (90kg → ▼ -5.3% / — 0%)', /▼ -5\.3%\s*지난 운동/.test(t) && /— 0%\s*지난주/.test(t));
  await page.locator('button:has-text("비교 기준 보기")').click();
  await sleep(150);
  t = await text();
  check('[D6] 상세 보기: 비교 날짜 + 세트 기준', t.includes('1세트') && /\d{4}-\d{2}-\d{2} · 1세트/.test(t));
  await weightInput.fill('100');

  // ===================== E. 다른 요일 루틴으로 운동 완료 =====================
  async function completeSet(weight, reps) {
    if (weight != null) await page.locator('.gym-set-input label:has-text("중량") input').fill(String(weight));
    await page.locator('.gym-set-input label:has-text("반복") input').fill(String(reps));
    await page.locator('.gym-set-input button:has-text("세트 완료")').click();
    await sleep(400);
    const skip = page.locator('button:has-text("건너뛰기")');
    if (await skip.count()) {
      await skip.first().click();
      await sleep(300);
    }
  }
  await completeSet(100, 8);
  t = await text();
  check('[E1] 2세트: 루틴 목표 105kg prefill, 세트별 비교 (95 → 105 = +10.5%)', (await page.locator('.gym-set-input label:has-text("중량") input').inputValue()) === '105' && /▲ \+10\.5%\s*지난 운동/.test(t), t.slice(0, 900));
  await completeSet(105, 6);
  // The app may auto-advance to the next exercise; only click if the button is shown.
  const next = page.locator('button:has-text("다음 훈련")');
  if (await next.count()) await next.first().click();
  await sleep(500);
  t = await text();
  check('[E2] 두번째 운동 레그 프레스 / 과거 기록 없음 표시', t.includes('레그 프레스') && t.includes('이전 중량 기록 없음'), t.slice(0, 700));
  await completeSet(150, 12);
  await sleep(800);
  t = await text();
  check('[E3] 완료 화면 + 불러온 루틴 표시', t.includes('오늘의 훈련 완료') && t.includes(`불러온 루틴: ${otherLabel}`), t.slice(0, 500));
  check('[E4] "다음 루틴에 반영"은 원본(선택 요일) 대상으로 표시', t.includes(`(${otherLabel.replace('요일', '')}요일 루틴)`));
  await shot('e-complete');

  const after = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const { todayDateKey } = await import('/src/lib/dateUtil.ts');
    const { generateTodayTrainingPlan } = await import('/src/lib/todayTraining/planner.ts');
    const e = listTrainingHistory().find((x) => x.gymRoutine);
    const plan = generateTodayTrainingPlan();
    return { entry: e, today: todayDateKey(), routines: localStorage.getItem('martialdex:gym-routines'), planIds: plan.techniqueIds, planSub: plan.gymRoutineSubstituted ?? false };
  });
  const e = after.entry;
  check('[E5] 기록 날짜 = 오늘 실제 날짜', e && e.date === after.today, JSON.stringify(e?.date));
  check('[E6] 기록에 실제 수행 루틴(선택 요일, substituted) 저장', e && e.gymRoutine.weekday === seed.other && e.gymRoutine.substituted === true && e.gymRoutine.routineName === 'QA 분할 루틴', JSON.stringify(e?.gymRoutine));
  check('[E7] 기록 운동 = 불러온 루틴 운동/순서', e && JSON.stringify(e.exerciseDetails.map((x) => x.techniqueId)) === '["gym-바벨-백스쿼트","gym-레그-프레스"]');
  check('[E8] 세트별 중량 기록', e && JSON.stringify(e.exerciseDetails[0].actualWeightKg) === '[100,105]' && JSON.stringify(e.exerciseDetails[0].actualReps) === '[8,6]');
  check('[E9] 루틴 원본 변경 없음 (byte-identical)', after.routines === seed.before);
  check('[E10] 오늘 원래 루틴은 그대로 (벤치프레스)', JSON.stringify(after.planIds) === '["gym-벤치프레스"]' && after.planSub === false, JSON.stringify(after.planIds));

  await goto('#/training-analytics/history');
  t = await text();
  check('[E11] 기록 목록: "QA 분할 루틴 · X요일 루틴 기반"', t.includes(`QA 분할 루틴 · ${otherLabel} 루틴 기반`), t.slice(0, 600));
  await goto(`#/training-analytics/${e.id}`);
  t = await text();
  check('[E12] 기록 상세: 수행한 루틴 표시', t.includes('수행한 루틴') && t.includes(`${otherLabel} 루틴 기반 운동`) && t.includes(after.today), t.slice(0, 900));

  // Today's own session through the normal path → substituted false.
  const normal = await page.evaluate(async () => {
    const { generateTodayTrainingPlan } = await import('/src/lib/todayTraining/planner.ts');
    const { startTodaySession, finalizeTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    const s = startTodaySession(generateTodayTrainingPlan());
    const r = finalizeTodaySession({ ...s, completedTechniqueIds: s.plan.techniqueIds });
    const { getTrainingHistoryEntry } = await import('/src/lib/trainingHistory/service.ts');
    return getTrainingHistoryEntry(r.entryId).gymRoutine;
  });
  check('[E13] 오늘 루틴 정상 실행 → substituted=false, 오늘 요일 기록', normal && normal.substituted === false && normal.weekday === seed.today, JSON.stringify(normal));

  // Swapped-day session feeds future comparisons (by performed date).
  const fed = await page.evaluate(async () => {
    const cmp = await import('/src/lib/gymTraining/weightComparison.ts');
    const { todayDateKey } = await import('/src/lib/dateUtil.ts');
    const b = cmp.findWeightBaselines(cmp.listPastWeightRecords('gym-바벨-백스쿼트', undefined));
    return { s: b.lastSession?.date, top: b.lastSession?.topLoadKg, today: todayDateKey() };
  });
  check('[E14] 대체 루틴 기록이 다음 비교의 "지난 운동"으로 사용됨', fed.s === fed.today && fed.top === 105, JSON.stringify(fed));

  // ===================== F. 앱 재실행 후 유지 =====================
  await app.close();
  ({ app, page } = await launch(dir));
  const persisted = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return { entry: listTrainingHistory().find((x) => x.gymRoutine?.substituted), routines: localStorage.getItem('martialdex:gym-routines') };
  });
  check('[F1] 재실행 후 대체 루틴 기록 유지', persisted.entry && persisted.entry.id === e.id && persisted.entry.gymRoutine.weekday === seed.other);
  check('[F2] 재실행 후 루틴 원본 그대로', persisted.routines === seed.before);

  // ===================== G. 회귀: 루틴 없는 사용자 / 휴식일 =====================
  const reg = await page.evaluate(async () => {
    const { buildTrainingPlanForGymRoutineDay } = await import('/src/lib/todayTraining/planner.ts');
    const { listMyGymRoutines } = await import('/src/lib/gymRoutine/service.ts');
    const r = listMyGymRoutines()[0];
    const empty = [1, 2, 3, 4, 5, 6, 7].find((w) => !r.days.some((d) => d.weekday === w));
    return { restDay: buildTrainingPlanForGymRoutineDay(r.id, empty), missing: buildTrainingPlanForGymRoutineDay('nope', 1) };
  });
  check('[G1] 휴식일/없는 루틴은 시작 불가 (null)', reg.restDay === null && reg.missing === null);
  await goto('#/training');
  t = await text();
  check('[G2] 훈련 허브: 훈련 시작 + 다른 요일 루틴 버튼', t.includes('훈련 시작') && t.includes('다른 요일 루틴으로 운동하기'));
  check('[G3] 페이지 에러 없음', errors.length === 0, errors.join(' | '));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
