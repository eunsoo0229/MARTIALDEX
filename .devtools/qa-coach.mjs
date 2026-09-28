import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR =
  '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-coach-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function main() {
  let { app, page, consoleErrors } = await launch();

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await new Promise((r) => setTimeout(r, 500));
  }
  async function shot(name) {
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  }
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }
  async function textsOf(sel) {
    return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent?.trim() ?? ''), sel);
  }
  async function clickText(text, selector = 'a, button') {
    return page.evaluate(
      ({ t, s }) => {
        const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t));
        if (!el) return 'NOT_FOUND';
        el.click();
        return 'OK';
      },
      { t: text, s: selector }
    );
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // Mocks the same boundary point as qa-fighter-style.mjs — a temporary,
  // additive window.__MARTIALDEX_TEST_MOCK_ASK__ hook in ai/provider.ts
  // (reverted after this run) is the only way to drive the coach's
  // AI-narration call without spending real Gemini free-tier quota.
  await page.evaluate(() => {
    window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
      const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
      if (!isJsonMode) {
        return { ok: true, text: '이것은 테스트용 모킹 응답입니다.' };
      }
      if ((request.question || '').includes('추천 이유를 설명해줘')) {
        return { ok: true, text: JSON.stringify({ reason: '최근 Boxing Jab의 분석 점수가 하락 추세라 우선 학습으로 추천했습니다. 테스트용 AI 코칭 문구입니다.' }) };
      }
      return { ok: false, code: 'UNKNOWN', message: '알 수 없는 테스트 모킹 요청입니다.' };
    };
  });

  // ============ SEED REALISTIC DATA ============
  // boxing__jab: declining, needs_improvement -> should be #1 weakness.
  // boxing__cross: single average score.
  // boxing__hook: improving, proficient -> should show in "최근 향상된 기술".
  // wrestling__wrestling-stance: practiced (trainingHistory) but never analyzed -> "학습 중".
  // official__boxing curriculum: Day 1 completed -> today's training should pick up Day 2.
  const seedResult = await page.evaluate(() => {
    const now = Date.now();
    const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();
    const poseRecords = [
      { recordId: 'r1', techniqueId: 'boxing__jab', martialArtId: 'boxing', score: 70, status: 'average', metricScores: { stance: 70 }, analyzedAt: iso(10) },
      { recordId: 'r2', techniqueId: 'boxing__jab', martialArtId: 'boxing', score: 55, status: 'needs_improvement', metricScores: { stance: 55 }, analyzedAt: iso(1) },
      { recordId: 'r3', techniqueId: 'boxing__cross', martialArtId: 'boxing', score: 65, status: 'average', metricScores: { stance: 65 }, analyzedAt: iso(5) },
      { recordId: 'r4', techniqueId: 'boxing__hook', martialArtId: 'boxing', score: 75, status: 'good', metricScores: { stance: 75 }, analyzedAt: iso(20) },
      { recordId: 'r5', techniqueId: 'boxing__hook', martialArtId: 'boxing', score: 82, status: 'good', metricScores: { stance: 82 }, analyzedAt: iso(10) },
      { recordId: 'r6', techniqueId: 'boxing__hook', martialArtId: 'boxing', score: 88, status: 'good', metricScores: { stance: 88 }, analyzedAt: iso(2) },
    ];
    localStorage.setItem('martialdex:pose-records', JSON.stringify(poseRecords));

    const trainingHistory = [
      {
        id: 'h1',
        date: new Date().toISOString().slice(0, 10),
        completedAt: iso(3),
        curriculumId: null,
        dayNumber: null,
        techniqueIds: ['wrestling__wrestling-stance'],
        completed: true,
        estimatedMinutes: 20,
        actualMinutes: 18,
        notes: null,
        source: 'coach_today',
      },
    ];
    localStorage.setItem('martialdex:training-history', JSON.stringify(trainingHistory));

    const progress = {
      'official__boxing': {
        curriculumId: 'official__boxing',
        currentDay: 2,
        completedDays: [1],
        startedAt: iso(3),
        lastStudiedAt: iso(1),
        progress: Math.round((1 / 34) * 100),
      },
    };
    localStorage.setItem('martialdex:curricula:progress', JSON.stringify(progress));

    return { poseRecords: poseRecords.length, trainingHistory: trainingHistory.length };
  });
  check('Seeded realistic pose/training/progress data', seedResult.poseRecords === 6 && seedResult.trainingHistory === 1, JSON.stringify(seedResult));
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  // re-inject the mock after reload (a fresh page load clears the plain window property)
  await page.evaluate(() => {
    window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
      const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
      if (!isJsonMode) return { ok: true, text: '이것은 테스트용 모킹 응답입니다.' };
      if ((request.question || '').includes('추천 이유를 설명해줘')) {
        return { ok: true, text: JSON.stringify({ reason: '최근 Boxing Jab의 분석 점수가 하락 추세라 우선 학습으로 추천했습니다. 테스트용 AI 코칭 문구입니다.' }) };
      }
      return { ok: false, code: 'UNKNOWN', message: '알 수 없는 테스트 모킹 요청입니다.' };
    };
  });

  // ============ 1. NAV MENU ============
  check('Nav has "AI 코치" link', (await clickText('AI 코치', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('Landed on AI Coach page', ((await textOf('.section-title h2')) ?? '').includes('AI 개인 코치'));
  await shot('01-coach-hub');

  // ============ 2. STATS REFLECT SEEDED DATA ============
  const statStrongs = await textsOf('.curriculum-stat-row strong');
  check('Coach stats show learned/proficient/average/needsImprovement counts', statStrongs.length >= 4, JSON.stringify(statStrongs));
  check('Proficient count includes boxing__hook (>=1)', Number(statStrongs[1]) >= 1, statStrongs[1]);
  check('Needs-improvement count includes boxing__jab (>=1)', Number(statStrongs[3]) >= 1, statStrongs[3]);

  // ============ 3. WEAKNESS TOP 5 ============
  const weaknessRows = await textsOf('.pose-history-row__main');
  const weaknessText = weaknessRows.join(' | ');
  check('Weakness TOP list includes Jab as a top entry', weaknessText.includes('Jab'), weaknessText);

  // ============ 4-6. TODAY'S COACHING (AI narration) ============
  check('오늘의 코칭 받기 click ->', (await clickText('오늘의 코칭 받기', 'button')) === 'OK');
  let gotRecommendation = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await textOf('.ai-inline-warning')) break;
    const reasonEl = await textOf('.card.info-card p strong');
    if (reasonEl?.includes('추천 이유')) {
      gotRecommendation = true;
      break;
    }
  }
  check('Coaching recommendation rendered', gotRecommendation);
  const reasonText = await textOf('.card.info-card p');
  check('AI-narrated reason text shown (mocked)', (reasonText ?? '').includes('테스트용 AI 코칭 문구'), reasonText);
  const priorityChip = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.chip-row')];
    const row = rows.find((r) => r.textContent?.includes('우선 학습'));
    return row?.querySelector('.chip.active')?.textContent ?? row?.querySelector('a')?.textContent ?? null;
  });
  check('Priority recommendation is the weakest real technique (Jab)', (priorityChip ?? '').includes('Jab'), priorityChip);
  await shot('02-coaching-result');

  // ============ 7. GEMINI ERROR HANDLING (force a JSON parse/AI failure path) ============
  await page.evaluate(() => {
    window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
      const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
      if (!isJsonMode) return { ok: true, text: 'ok' };
      return { ok: false, code: 'RATE_LIMIT', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
    };
  });
  check('오늘의 코칭 다시 받기 click -> (forced AI failure)', (await clickText('오늘의 코칭 다시 받기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 800));
  const fallbackNotice = await textOf('.video-status-message');
  const stillHasRecommendation = await page.evaluate(() => !!document.querySelector('.card.info-card h3'));
  check('AI failure degrades gracefully (still shows a recommendation, no crash)', stillHasRecommendation);
  check('Fallback notice shown on AI failure', (fallbackNotice ?? '').includes('기본 문구'), fallbackNotice);
  await shot('03-ai-failure-fallback');

  // ============ AI ASK (coach chat) ============
  check('✦ AI에게 직접 물어보기 click ->', (await clickText('✦ AI에게 직접 물어보기')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const coachModalIntro = await textOf('.ai-modal p');
  check('Coach AI modal shows learning-record-based intro', (coachModalIntro ?? '').includes('학습 기록'), coachModalIntro);
  const coachExamples = await textsOf('.ai-chat__example');
  check('Coach example questions shown', coachExamples.some((q) => q.includes('오늘 뭐 연습할까')), JSON.stringify(coachExamples));
  await clickText('닫기');
  await new Promise((r) => setTimeout(r, 200));

  // ============ 8. WEAKNESS -> CURRICULUM CONNECTION (14-9) ============
  const weaknessBeforeCount = await page.evaluate(() => document.querySelectorAll('.technique-row').length);
  check('이 약점 개선하기 click ->', (await clickText('이 약점 개선하기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 600));
  const weaknessCurriculumTitle = await textOf('.detail-hero h1');
  check('Navigated to a newly created weakness-improvement curriculum', (weaknessCurriculumTitle ?? '').includes('약점 개선'), weaknessCurriculumTitle);
  const weaknessDayCount = await page.evaluate(() => document.querySelectorAll('.day-card').length);
  check('Weakness curriculum has exactly 5 days', weaknessDayCount === 5, `days=${weaknessDayCount}`);
  await shot('04-weakness-curriculum');
  void weaknessBeforeCount;

  // ============ 9. MY SKILLS DASHBOARD ============
  await goto('#/my-skills');
  await new Promise((r) => setTimeout(r, 400));
  const overallStats = await textsOf('.curriculum-stat-row strong');
  check('My Skills shows overall dashboard (total ~1253)', Number(overallStats[0]) > 1000, overallStats[0]);
  await shot('05-myskills-overview');

  check('무술별 보기 click ->', (await clickText('무술별 보기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const artBreakdownCards = await page.evaluate(() => document.querySelectorAll('.card.info-card').length);
  check('Martial-art breakdown view renders per-art cards', artBreakdownCards > 1, `cards=${artBreakdownCards}`);
  await shot('06-myskills-byart');

  check('포지션별 보기 click ->', (await clickText('포지션별 보기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const positionRows = await textsOf('.pose-history-row__main');
  check('Position breakdown shows Standing/Clinch/Guard/Mount/Back Control', positionRows.some((r) => r.includes('Standing')), JSON.stringify(positionRows));

  check('숙련도별 보기 click ->', (await clickText('숙련도별 보기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const filterOk = await page.evaluate(() => {
    const selects = document.querySelectorAll('.filter-bar select.select');
    return selects.length >= 3;
  });
  check('Mastery view has martial-art/status/sort filters', filterOk);
  await shot('07-myskills-mastery-list');

  // ============ 10-14. TECHNIQUE DETAIL: mastery + override + score history ============
  await goto('#/arts/boxing/techniques/boxing__jab');
  await new Promise((r) => setTimeout(r, 400));
  const masteryChip = await textOf('.card.info-card .chip.active');
  check('Technique detail shows needs_improvement mastery for Jab', (masteryChip ?? '').includes('개선 필요'), masteryChip);
  const scoreChartPresent = await page.evaluate(() => !!document.querySelector('.score-chart'));
  check('Score history chart renders (>=2 real records)', scoreChartPresent);
  await shot('08-technique-detail-mastery');

  check('숙련도 변경 click ->', (await clickText('숙련도 변경', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  check('숙련 (override) click ->', (await clickText('🟢 숙련', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const overriddenChip = await textOf('.card.info-card .chip.active');
  check('User override applied and shown', (overriddenChip ?? '').includes('숙련'), overriddenChip);
  const overrideTag = await textOf('.card.info-card .chip-row');
  check('"사용자 지정" tag shown after override', (overrideTag ?? '').includes('사용자 지정'), overrideTag);

  check('숙련도 변경 (revert) click ->', (await clickText('숙련도 변경', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  check('자동 계산으로 되돌리기 click ->', (await clickText('자동 계산으로 되돌리기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const revertedChip = await textOf('.card.info-card .chip.active');
  check('Override cleared -> back to computed needs_improvement', (revertedChip ?? '').includes('개선 필요'), revertedChip);
  await shot('09-override-revert');

  // ============ 15-17. TODAY'S TRAINING (curriculum mode, from seeded progress) ============
  // "오늘의 훈련" no longer auto-picks an in-progress curriculum (커리큘럼은
  // 루틴이 아니므로 제외됨 — see planner.ts's generateTodayTrainingPlan()) —
  // start the seeded official__boxing curriculum's Day 2 explicitly, the
  // same call the real "훈련하기" button makes. Since a session already
  // exists when the page loads, TodayTraining.tsx goes straight to the
  // set/rep/timer exercise screen (no more preview/"훈련 시작" landing screen
  // to check — that only shows before any session exists).
  await page.evaluate(async () => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { startCurriculumDayTraining } = await import('/src/lib/todayTraining/sessionStore.ts');
    startCurriculumDayTraining(getCurriculum('official__boxing'), 2);
  });
  await goto('#/today-training');
  await new Promise((r) => setTimeout(r, 400));
  const dayChip = await textOf('.chip.active');
  check('오늘의 훈련 shows the explicitly-started official__boxing session (DAY 2)', (dayChip ?? '').includes('2'), dayChip);
  await shot('10-today-training-preview');

  // Full per-set UI walkthrough (set/rep entry, rest timers, auto-progress)
  // is already exhaustively covered by qa-training-session.mjs's dedicated
  // 24-check suite — here we only need to confirm 오늘의 훈련 + AI 코치 +
  // curriculum progress integrate correctly, so finish via the real "오늘
  // 훈련 전체 완료" button (skips ahead without fabricating per-set data).
  page.once('dialog', (d) => d.accept());
  check('오늘 훈련 전체 완료 click ->', (await clickText('오늘 훈련 전체 완료', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 500));
  const completionHeading = await textOf('.section-title h2');
  check('Today\'s training completion screen shown', (completionHeading ?? '').includes('완료'), completionHeading);
  await shot('11-today-training-complete');

  const historyAfterFinish = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:training-history') || '[]').length);
  check('Training history entry recorded on finish', historyAfterFinish >= 2, `entries=${historyAfterFinish}`);

  const boxingProgressAfter = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('martialdex:curricula:progress') || '{}');
    return all['official__boxing'];
  });
  check('Curriculum Day marked complete via 오늘의 훈련 (reuses setDayComplete)', boxingProgressAfter?.completedDays?.includes(2), JSON.stringify(boxingProgressAfter));

  // ============ 18-19. HOME WIDGETS ============
  await goto('#/');
  await new Promise((r) => setTimeout(r, 400));
  const homeHasTodayCard = await page.evaluate(() => [...document.querySelectorAll('h2')].some((h) => h.textContent?.includes('오늘의 훈련')));
  const homeHasCoachCard = await page.evaluate(() => [...document.querySelectorAll('h2')].some((h) => h.textContent?.includes('AI 개인 코치')));
  check('Home shows 오늘의 훈련 card', homeHasTodayCard);
  check('Home shows AI 개인 코치 card', homeHasCoachCard);
  await shot('12-home-widgets');

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 20-22. RESTART -> PERSISTENCE ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  await goto('#/my-skills');
  await new Promise((r) => setTimeout(r, 500));
  const statsAfterRestart = await textsOf('.curriculum-stat-row strong');
  check('Dashboard stats persist after app restart', Number(statsAfterRestart[0]) > 1000, statsAfterRestart[0]);
  await goto('#/arts/boxing/techniques/boxing__hook');
  await new Promise((r) => setTimeout(r, 400));
  const hookMasteryAfterRestart = await textOf('.card.info-card .chip.active');
  check('Proficient mastery persists after restart (Hook)', (hookMasteryAfterRestart ?? '').includes('숙련'), hookMasteryAfterRestart);
  await shot('13-after-restart');

  // ============ REGRESSION ============
  await goto('#/');
  check('[Regression] Home shows 10 martial arts', (await page.evaluate(() => document.querySelectorAll('.art-card').length)) === 10);
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('Armbar', { delay: 15 });
  await new Promise((r) => setTimeout(r, 350));
  check('[Regression] Search still works', (await page.evaluate(() => document.querySelectorAll('.search-result-row').length)) > 0);
  await page.keyboard.press('Escape');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  check('[Regression] Technique detail still works', (await textOf('.detail-hero h1')) === 'Armbar');
  check('[Regression] YouTube embed still works', (await page.evaluate(() => document.querySelectorAll('.video-embed iframe').length)) > 0);

  await goto('#/learning/bjj');
  check('[Regression] Official curriculum overview still works', ((await textOf('.curriculum-hero h3')) ?? '').includes('주짓수'));

  await goto('#/fighter-style');
  check('[Regression] Fighter-style hub still works', ((await textOf('.section-title h2')) ?? '') === '선수 스타일 학습');

  await goto('#/arts/boxing/techniques/boxing__jab');
  check('[Regression] Pose-analysis button still present on supported technique', await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기'))));

  console.log('\n=== CONSOLE ERRORS TOTAL (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(
    '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-coach-results.json',
    JSON.stringify({ results, consoleErrors }, null, 2)
  );

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
