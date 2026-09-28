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

// Verifies the new "훈련 루틴 관리" (GymRoutineActivation.tsx) screen: lists
// every routine, toggles GymRoutine.active (the SAME field
// todayResolver.ts's getTodayGymRoutineDay() already reads), restart
// persistence, and that 오늘의 훈련 always reflects exactly the currently
// active routine — never a mix of two routines' exercises.
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-routine-activation-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  async function getPage(a) {
    let p = null;
    for (let i = 0; i < 30 && !p; i++) {
      p = a.windows().find((w) => w.url().startsWith('http://localhost:5173'));
      if (!p) await sleep(300);
    }
    if (!p) p = await a.firstWindow();
    await p.waitForLoadState('load');
    await sleep(700);
    return p;
  }
  let page = await getPage(app);
  const consoleErrors = [];
  function wireErrors(p) {
    p.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    p.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  }
  wireErrors(page);

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await sleep(500);
  }
  async function bodyText() {
    return page.evaluate(() => document.body.innerText);
  }

  // ---- 1. Empty state ----
  await goto('#/training/routines/manage');
  let text = await bodyText();
  check('[1][빈 상태] /training/routines/manage 크래시 없이 렌더', text.includes('훈련 루틴 관리'), text.slice(0, 200));
  check('[1b][빈 상태] "아직 만든 루틴이 없습니다" 표시', text.includes('아직 만든 루틴이 없습니다'), '');
  check('[1c][빈 상태] 활성 루틴 0개 표시', text.includes('활성 루틴 0개'), '');

  // ---- 2. Seed 3 routines with distinct exercises (근력/격투기 스타일 이름은 임의, 실제로는 전부 헬스 운동 기반 GymRoutine) ----
  const seeded = await page.evaluate(async () => {
    const { createGymRoutine, addExerciseToDay } = await import('/src/lib/gymRoutine/service.ts');
    const { getKstWeekday } = await import('/src/lib/dateUtil.ts');
    const today = getKstWeekday();

    let a = createGymRoutine('근력 루틴 A');
    a = addExerciseToDay(a, today, {
      techniqueId: 'gym-벤치프레스',
      targetSets: 3,
      targetReps: [10, 10, 10],
      targetSeconds: null,
      targetWeightKg: 60,
      restSeconds: 90,
    });

    let b = createGymRoutine('근력 루틴 B');
    b = addExerciseToDay(b, today, {
      techniqueId: 'gym-스쿼트',
      targetSets: 4,
      targetReps: [8, 8, 8, 8],
      targetSeconds: null,
      targetWeightKg: 80,
      restSeconds: 120,
    });

    const c = createGymRoutine('휴식 루틴 C (요일 미구성)');

    return { aId: a.id, bId: b.id, cId: c.id, today };
  });
  check('[2][seed] 루틴 A/B/C 생성됨', !!seeded.aId && !!seeded.bId && !!seeded.cId, JSON.stringify(seeded));

  // ---- 3. Management screen lists all 3 with correct names/summaries ----
  await goto('#/training/routines/manage');
  text = await bodyText();
  check('[3][목록] 루틴 A/B/C 모두 표시됨', text.includes('근력 루틴 A') && text.includes('근력 루틴 B') && text.includes('휴식 루틴 C'), text.slice(0, 500));
  check('[3b][목록] 벤치프레스가 포함된 루틴 A에 "1개 운동" 표시', /근력 루틴 A[\s\S]{0,80}1개 운동/.test(text), '');
  check('[3c][목록] 아직 아무도 활성화 안 해서 활성 루틴 0개', text.includes('활성 루틴 0개'), '');
  const allToggleOff = await page.evaluate(() => [...document.querySelectorAll('.routine-toggle')].every((b) => b.getAttribute('aria-checked') === 'false'));
  check('[3d][목록] 모든 토글이 "비활성" 상태로 표시', allToggleOff, '');

  // ---- 4. Activate routine A via one tap ----
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('근력 루틴 A'));
    row.querySelector('.routine-toggle').click();
  });
  await sleep(400);
  text = await bodyText();
  check('[4][토글] 루틴 A 활성화 후 "활성 루틴 1개"로 즉시 반영', text.includes('활성 루틴 1개'), '');
  const aToggleState = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('근력 루틴 A'));
    return row.querySelector('.routine-toggle').getAttribute('aria-checked');
  });
  check('[4b][토글] 루틴 A의 스위치가 즉시 "활성"으로 표시', aToggleState === 'true', `aria-checked=${aToggleState}`);

  // ---- 5. 오늘의 훈련에 루틴 A의 벤치프레스만 반영 (루틴 B 섞이지 않음) ----
  const planCheckA = await page.evaluate(async () => {
    const { generateTodayTrainingPlan } = await import('/src/lib/todayTraining/planner.ts');
    const plan = generateTodayTrainingPlan();
    return { techniqueIds: plan.techniqueIds, gymRoutineId: plan.gymRoutineId, mode: plan.mode };
  });
  check(
    '[5][오늘의 훈련] 루틴 A 활성화 시 벤치프레스만 포함, 스쿼트는 섞이지 않음',
    planCheckA.techniqueIds.includes('gym-벤치프레스') && !planCheckA.techniqueIds.includes('gym-스쿼트') && planCheckA.gymRoutineId === seeded.aId,
    JSON.stringify(planCheckA)
  );

  // ---- 6. Activate routine B — A must auto-deactivate (never both active) ----
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('근력 루틴 B'));
    row.querySelector('.routine-toggle').click();
  });
  await sleep(400);
  text = await bodyText();
  check('[6][토글] 루틴 B 활성화해도 "활성 루틴 1개" 유지 (동시에 2개 활성 안 됨)', text.includes('활성 루틴 1개'), '');
  const statesAfterB = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.routine-toggle-row')];
    const of = (name) => rows.find((r) => r.textContent.includes(name)).querySelector('.routine-toggle').getAttribute('aria-checked');
    return { a: of('근력 루틴 A'), b: of('근력 루틴 B') };
  });
  check(
    '[6b][토글] 루틴 B 활성화 시 루틴 A는 자동으로 비활성 표시로 전환됨',
    statesAfterB.a === 'false' && statesAfterB.b === 'true',
    JSON.stringify(statesAfterB)
  );

  const planCheckB = await page.evaluate(async () => {
    const { generateTodayTrainingPlan } = await import('/src/lib/todayTraining/planner.ts');
    const plan = generateTodayTrainingPlan();
    return { techniqueIds: plan.techniqueIds, gymRoutineId: plan.gymRoutineId };
  });
  check(
    '[7][오늘의 훈련] 루틴 B로 전환 후 스쿼트만 포함, 벤치프레스는 제외됨 (루틴 뒤섞임 방지)',
    planCheckB.techniqueIds.includes('gym-스쿼트') && !planCheckB.techniqueIds.includes('gym-벤치프레스') && planCheckB.gymRoutineId === seeded.bId,
    JSON.stringify(planCheckB)
  );

  // ---- 8. Deactivate routine B — leaves zero active, 오늘의 훈련 falls back cleanly ----
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('근력 루틴 B'));
    row.querySelector('.routine-toggle').click();
  });
  await sleep(400);
  text = await bodyText();
  check('[8][토글] 루틴 B 비활성화 시 "활성 루틴 0개"로 반영', text.includes('활성 루틴 0개'), '');
  const planCheckNone = await page.evaluate(async () => {
    const { generateTodayTrainingPlan } = await import('/src/lib/todayTraining/planner.ts');
    const plan = generateTodayTrainingPlan();
    return { techniqueIds: plan.techniqueIds };
  });
  check(
    '[8b][오늘의 훈련] 모든 루틴 비활성화 후 헬스 운동이 더 이상 포함되지 않음',
    !planCheckNone.techniqueIds.includes('gym-벤치프레스') && !planCheckNone.techniqueIds.includes('gym-스쿼트'),
    JSON.stringify(planCheckNone)
  );

  // ---- 9. 비활성화해도 루틴 자체 데이터(운동 목록)는 삭제되지 않음 ----
  const routinesStillIntact = await page.evaluate(async () => {
    const { listMyGymRoutines } = await import('/src/lib/gymRoutine/service.ts');
    const routines = listMyGymRoutines();
    const a = routines.find((r) => r.name === '근력 루틴 A');
    const b = routines.find((r) => r.name === '근력 루틴 B');
    return {
      count: routines.length,
      aHasExercise: a?.days.some((d) => d.exercises.some((e) => e.techniqueId === 'gym-벤치프레스')),
      bHasExercise: b?.days.some((d) => d.exercises.some((e) => e.techniqueId === 'gym-스쿼트')),
    };
  });
  check(
    '[9][데이터 보존] 비활성화 후에도 루틴 3개 모두 남아있고 운동 목록도 그대로',
    routinesStillIntact.count === 3 && routinesStillIntact.aHasExercise && routinesStillIntact.bHasExercise,
    JSON.stringify(routinesStillIntact)
  );

  // ---- 10. Reactivate A, then verify existing GymRoutineManager still works unaffected ----
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('근력 루틴 A'));
    row.querySelector('.routine-toggle').click();
  });
  await sleep(400);
  await goto('#/training/routines');
  text = await bodyText();
  check('[10][회귀] 기존 GymRoutineManager 화면에서도 루틴 A가 "활성"으로 정확히 표시', /근력 루틴 A[\s\S]{0,50}활성/.test(text), text.slice(0, 400));
  check('[10b][회귀] "루틴 관리 →" 링크가 GymRoutineManager에 추가됨', text.includes('루틴 관리'), '');

  // Existing edit/create/delete flow still works — create one more routine via the OLD screen's inline form.
  await page.fill('input[placeholder="예: 5분할 루틴"]', 'QA 신규 생성 루틴');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ 루틴 만들기'))?.click();
  });
  await sleep(400);
  text = await bodyText();
  check('[11][회귀] 기존 루틴 생성 기능 정상 동작', text.includes('QA 신규 생성 루틴'), '');

  // ---- 12. App restart — active state persists ----
  await app.close();
  app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  page = await getPage(app);
  wireErrors(page);
  await goto('#/training/routines/manage');
  text = await bodyText();
  check('[12][재시작] 앱 재시작 후에도 루틴 A가 활성 상태로 유지됨', text.includes('활성 루틴 1개'), text.slice(0, 400));
  const aStillOnAfterRestart = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.routine-toggle-row')].find((r) => r.textContent.includes('근력 루틴 A'));
    return row?.querySelector('.routine-toggle').getAttribute('aria-checked');
  });
  check('[12b][재시작] 루틴 A 토글이 여전히 "활성"으로 표시', aStillOnAfterRestart === 'true', `aria-checked=${aStillOnAfterRestart}`);
  const planAfterRestart = await page.evaluate(async () => {
    const { generateTodayTrainingPlan } = await import('/src/lib/todayTraining/planner.ts');
    const plan = generateTodayTrainingPlan();
    return { techniqueIds: plan.techniqueIds };
  });
  check(
    '[12c][재시작] 오늘의 훈련도 재시작 후 여전히 루틴 A(벤치프레스) 기준',
    planAfterRestart.techniqueIds.includes('gym-벤치프레스'),
    JSON.stringify(planAfterRestart)
  );

  // ---- 13. Mobile viewport: list scrolls, touch targets large enough ----
  await page.setViewportSize({ width: 375, height: 812 });
  await goto('#/training/routines/manage');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('[13][모바일] 가로 스크롤 없음', overflow <= 1, `overflow=${overflow}px`);
  const toggleSize = await page.evaluate(() => {
    const btn = document.querySelector('.routine-toggle');
    const r = btn.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  check(
    '[13b][모바일] 토글 버튼 터치 영역이 44px 이상 (한 손 조작 가능)',
    toggleSize.height >= 44 && toggleSize.width >= 44,
    JSON.stringify(toggleSize)
  );
  await page.setViewportSize({ width: 1280, height: 900 });

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
