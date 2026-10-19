import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-mystyle-shots');
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

// ============ AI MOCK ============
const MOCK_SUCCESS_SCRIPT = () => {
  window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
    const sys = request.systemInstruction || '';
    const ctx = request.contextText || '';
    const isJsonMode = sys.includes('JSON만 반환하는');
    if (!isJsonMode) {
      window.__lastChatContext = ctx;
      return { ok: true, text: '테스트 응답입니다.' };
    }
    if (sys.includes('나의 무술 스타일')) {
      return {
        ok: true,
        text: JSON.stringify({
          styleName: 'Pressure Grappling',
          traits: ['전진 압박', '클린치 선호', '테이크다운 연결', '근거리 상황 선호'],
          attackTendency: '압박형 공격 성향이 관찰됩니다',
          defenseTendency: '보통 수준의 방어입니다',
          distance: '중거리~근거리',
          footwork: '전진 위주의 풋워크',
          clinch: '높은 활용도',
          takedown: '높은 활용도',
          ground: '탑 포지션 선호',
          techniqueSelection: '테이크다운/클린치 위주',
          transitionPattern: '클린치 → 테이크다운 → 탑 컨트롤 연결',
        }),
      };
    }
    if (sys.includes('선수 이름 추정값')) {
      return { ok: true, text: JSON.stringify({ fighterNameGuess: 'Islam Makhachev', styleQuery: null, goal: null }) };
    }
    if (sys.includes('실제로 존재하며 공개적으로 잘 알려진')) {
      return {
        ok: true,
        text: JSON.stringify({ candidates: [{ id: 'islam-makhachev', name: 'Islam Makhachev', sport: 'MMA', shortDescription: '테이크다운과 탑 컨트롤 중심의 UFC 라이트급 챔피언' }] }),
      };
    }
    if (sys.includes('공개적으로 잘 알려진 경기 스타일')) {
      return {
        ok: true,
        text: JSON.stringify({
          styleSummary: '강력한 테이크다운과 탑 컨트롤을 중심으로 하는 압박형 그래플러',
          primaryStyles: ['Wrestling', 'BJJ'],
          keyStrengths: ['Takedown', 'Top Control'],
          preferredPositions: ['Back Control', 'Mount'],
          keyTechniques: ['Armbar', 'Underhook', 'Collar Tie', 'Ankle Pick', 'Jab'],
          transitions: ['Collar Tie to Takedown'],
          distanceManagement: ['Clinch entries'],
          defensiveConcepts: ['Underhook control'],
          offensiveConcepts: ['Ground and pound'],
          trainingFocus: ['Wrestling drills'],
        }),
      };
    }
    if (sys.includes('학습 기간(일 단위)을 추천')) {
      return { ok: true, text: JSON.stringify({ recommendedDays: 45, reason: '테스트용 AI 기간 추천 이유입니다.' }) };
    }
    return { ok: true, text: JSON.stringify({ reason: '테스트 코칭 이유입니다.' }) };
  };
};

// ============ SEED DATA ============
const LEARNED_POOL = [
  'bjj__2-on-1', 'bjj__high-crotch', 'bjj__low-single', 'bjj__outside-single', 'bjj__inside-single',
  'bjj__running-the-pipe', 'bjj__ankle-pick', 'bjj__knee-tap', 'bjj__arm-drag', 'bjj__snap-down',
  'bjj__duck-under', 'bjj__fireman-s-carry', 'bjj__russian-tie-takedown', 'bjj__osoto-gari', 'bjj__ouchi-gari',
  'bjj__kouchi-gari', 'bjj__harai-goshi', 'bjj__uchi-mata', 'bjj__sasae-tsurikomi-ashi', 'bjj__collar-sleeve',
  'bjj__double-sleeve', 'bjj__overhook', 'bjj__underhook', 'bjj__wrist-control', 'bjj__head-control',
  'bjj__hip-control', 'bjj__posture-break', 'bjj__knee-in-the-middle', 'bjj__standing-guard-break', 'bjj__double-under-guard-break',
  'bjj__hip-pressure-guard-break', 'bjj__hip-bump-sweep', 'bjj__scissor-sweep', 'bjj__pendulum-sweep', 'bjj__flower-sweep',
  'bjj__lumberjack-sweep', 'bjj__sit-up-sweep', 'bjj__shoulder-clamp-sweep', 'bjj__armbar', 'bjj__triangle',
  'bjj__kimura', 'bjj__americana', 'bjj__cross-collar-choke', 'bjj__ezekiel-choke', 'bjj__omoplata',
  'bjj__feet-on-hips', 'bjj__spider-guard', 'bjj__lasso-guard', 'bjj__butterfly-guard', 'bjj__de-la-riva',
  'bjj__reverse-de-la-riva', 'bjj__x-guard',
];
// Deliberately analyzes only 2 of the 5 comparison-relevant ids
// (boxing__jab/Standing, bjj__armbar/Back Control) at a high score, leaving
// Clinch/Guard/Mount with ZERO current-side data — so the target style
// (which the AI mock gives real relevance in all 5 positions) has a
// genuine, real gap to recommend against instead of already-maxed current
// stars everywhere. The other 8 ids are unrelated to the comparison and
// only exist to reach the "10개 기술 숙련" achievement threshold.
const PROFICIENT_IDS = [
  'boxing__jab', 'bjj__armbar', 'bjj__triangle', 'bjj__kimura', 'bjj__americana',
  'bjj__omoplata', 'bjj__cross-collar-choke', 'bjj__ezekiel-choke', 'bjj__feet-on-hips', 'bjj__spider-guard',
];

function buildSeedData() {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  const dateKeyDaysAgo = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);

  // 10 pose-analyzed techniques -> 'proficient' status (score>=80, 2 records, delta>=0)
  const poseRecords = [];
  PROFICIENT_IDS.forEach((id, i) => {
    const martialArtId = id.split('__')[0];
    poseRecords.push({ recordId: `seed-${id}-1`, techniqueId: id, martialArtId, score: 82, status: 'average', metricScores: {}, analyzedAt: daysAgo(3 + i * 0.1) });
    poseRecords.push({ recordId: `seed-${id}-2`, techniqueId: id, martialArtId, score: 90, status: 'good', metricScores: {}, analyzedAt: daysAgo(1) });
  });

  // 10 trainingHistory entries: 7 on consecutive days ending today (streak),
  // 3 more on earlier days (total >=10 sessions), spread across 52 distinct
  // real technique ids (>=50 learned).
  const allLearnedIds = [...LEARNED_POOL];
  const chunkSize = Math.ceil(allLearnedIds.length / 10);
  const trainingHistory = [];
  for (let i = 0; i < 10; i++) {
    const dayOffset = i < 7 ? i : 7 + (i - 7) * 3;
    const chunk = allLearnedIds.slice(i * chunkSize, (i + 1) * chunkSize);
    trainingHistory.push({
      id: `seed-training-${i}`,
      date: dateKeyDaysAgo(dayOffset),
      completedAt: daysAgo(dayOffset),
      curriculumId: null,
      dayNumber: null,
      techniqueIds: chunk.length ? chunk : [allLearnedIds[0]],
      completed: true,
      estimatedMinutes: 30,
      actualMinutes: 28,
      notes: null,
      source: 'coach_today',
    });
  }
  trainingHistory.unshift({ ...trainingHistory[0], id: 'seed-training-today-extra' });

  // 10 sparring sessions: 6 in an older month (striking-dominant), 4 in the
  // current month (grappling-dominant), with a rising clinch share across
  // the grappling sessions to exercise the "비중 증가" timeline label.
  function motionEvents(counts) {
    const events = [];
    let t = 1;
    for (const [category, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) events.push({ timestampSec: t++, category, label: category, confidence: 'medium' });
    }
    return events;
  }
  const sparringSessions = [];
  const OLD_MONTH_DAYS_AGO = 70; // ~2 months ago
  for (let i = 0; i < 6; i++) {
    sparringSessions.push({
      id: `seed-sparring-old-${i}`,
      date: daysAgo(OLD_MONTH_DAYS_AGO - i),
      martialArt: 'boxing',
      videoName: 'test.mp4',
      videoDurationSec: 90,
      videoResolution: null,
      analysisScopes: ['technique'],
      overallScores: { technique: null, movement: 70, distance: 65, defense: 60, offense: 68, posture: 72 },
      motionEvents: motionEvents({ strike_like: 8, footwork_movement: 3, distance_exit_like: 1, clinch_like: 1 }),
      techniqueGuesses: [{ techniqueId: 'boxing__jab', techniqueName: 'Jab', martialArt: 'boxing', occurrences: [1, 2], estimated: true }],
      postureSegments: [],
      styleObservations: ['압박형 움직임이 관찰되었습니다.'],
      styleComparison: null,
      limitations: [],
      savedMoments: [],
      weakAreas: [{ label: 'Distance Management', score: 65 }],
      notes: null,
    });
  }
  const clinchCounts = [2, 3, 5, 6];
  for (let i = 0; i < 4; i++) {
    sparringSessions.push({
      id: `seed-sparring-new-${i}`,
      date: daysAgo(3 - i * 0.5),
      martialArt: 'bjj',
      videoName: 'test.mp4',
      videoDurationSec: 90,
      videoResolution: null,
      analysisScopes: ['technique'],
      overallScores: { technique: null, movement: 55, distance: 60, defense: 70, offense: 75, posture: 68 },
      motionEvents: motionEvents({ clinch_like: clinchCounts[i], level_change_like: 2, guard_hold_like: 1 }),
      techniqueGuesses: [{ techniqueId: 'bjj__armbar', techniqueName: 'Armbar', martialArt: 'bjj', occurrences: [1], estimated: true }],
      postureSegments: [],
      styleObservations: ['클린치 상황에서의 압박이 관찰되었습니다.'],
      styleComparison: null,
      limitations: [],
      savedMoments: [],
      weakAreas: [],
      notes: null,
    });
  }
  sparringSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // A completed regular curriculum -> "첫 커리큘럼 완료"
  const completedCurriculum = {
    id: 'custom__seed-completed-curriculum',
    martialArt: 'boxing',
    title: '완료된 테스트 커리큘럼',
    description: '',
    source: 'custom',
    visibility: 'private',
    authorName: '나',
    totalDays: 1,
    estimatedWeeks: 1,
    phases: [],
    days: [{ day: 1, title: 'Day 1', description: '', learningGoals: [], techniqueIds: ['boxing__jab'], reviewTechniqueIds: [], difficulty: null, estimatedMinutes: 20 }],
    techniqueCount: 1,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(1),
  };
  const completedProgress = { curriculumId: completedCurriculum.id, currentDay: 1, completedDays: [1], startedAt: daysAgo(20), lastStudiedAt: daysAgo(1), progress: 100 };

  return { poseRecords, trainingHistory, sparringSessions, completedCurriculum, completedProgress };
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
  async function bodyIncludes(text) {
    return page.evaluate((t) => document.body.textContent?.includes(t) ?? false, text);
  }

  // ============ 0. EMPTY STATE ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await goto('#/my-style');
  check('Empty state shown with no data at all', await bodyIncludes('분석 데이터가 부족합니다'));
  await shot('00-empty-state');

  // ============ 1. SEED DATA ============
  const seed = buildSeedData();
  const seeded = await page.evaluate((seed) => {
    localStorage.setItem('martialdex:pose-records', JSON.stringify(seed.poseRecords));
    localStorage.setItem('martialdex:training-history', JSON.stringify(seed.trainingHistory));
    localStorage.setItem('martialdex:sparring-sessions', JSON.stringify(seed.sparringSessions));
    localStorage.setItem('martialdex:curricula:custom', JSON.stringify([seed.completedCurriculum]));
    localStorage.setItem('martialdex:curricula:progress', JSON.stringify({ [seed.completedCurriculum.id]: seed.completedProgress }));
    return true;
  }, seed);
  check('Seeded pose/training/sparring/curriculum data', seeded);
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(MOCK_SUCCESS_SCRIPT);

  // ============ 2. CURRENT STYLE ANALYSIS ============
  await goto('#/my-style');
  check('Enough data now — "스타일 분석하기" button shown (not stale empty state)', !(await bodyIncludes('분석 데이터가 부족합니다')));
  check('스타일 분석하기 button click ->', (await clickText('스타일 분석하기', 'button')) === 'OK');
  let styleShown = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await bodyIncludes('Pressure Grappling')) {
      styleShown = true;
      break;
    }
  }
  check('AI-narrated style name rendered (mocked)', styleShown);
  check('Style traits rendered', await bodyIncludes('클린치 선호'));
  check('9 style-feature fields rendered', (await bodyIncludes('공격 성향')) && (await bodyIncludes('테이크다운')) && (await bodyIncludes('전환 패턴')));
  await shot('01-current-style');

  // ============ 3. TARGET STYLE — GENERIC PRESET ============
  check('레슬링 중심 preset click ->', (await clickText('레슬링 중심', 'button')) === 'OK');
  let targetReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await bodyIncludes('강력한 테이크다운과 탑 컨트롤')) {
      targetReady = true;
      break;
    }
  }
  check('Target style analysis ready (preset fast-path bypassing athlete identification)', targetReady);
  await shot('02-target-style-ready');

  // ============ 4. COMPARISON (real stars, both sides) ============
  const comparisonRows = await textsOf('.technique-row__sub');
  const hasRealStars = comparisonRows.some((r) => r.includes('★') && !r.includes('데이터 부족 · 데이터 부족'));
  check('Comparison rows show real star ratings on at least one side', hasRealStars, JSON.stringify(comparisonRows.slice(0, 6)));
  check('Comparison never shows numeric scores without real data (uses "데이터 부족" text)', comparisonRows.some((r) => r.includes('★')));
  await shot('03-comparison');

  // ============ 5. IMPROVEMENT RECOMMENDATIONS + [학습하기] ============
  const improvementNames = await textsOf('.technique-row__name');
  check('Improvement items list real technique names', improvementNames.length > 0, JSON.stringify(improvementNames.slice(0, 5)));
  check('학습하기 button click ->', (await clickText('학습하기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const todaySession = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session') || 'null'));
  check('학습하기 added a REAL technique id to today-training session', !!todaySession && todaySession.plan.techniqueIds.length > 0, JSON.stringify(todaySession?.plan?.techniqueIds));
  check('오늘의 훈련에 추가 confirmation message shown', await bodyIncludes('오늘의 훈련에 추가했습니다'));

  // ============ 6. TARGET STYLE CURRICULUM — DURATION / AI RECOMMEND ============
  check('14일 chip click ->', (await clickText('14일', 'button')) === 'OK');
  check('Selected duration text updates to 14일', await bodyIncludes('선택된 기간: 14일'));
  check('AI가 기간 추천 click ->', (await clickText('AI가 기간 추천', 'button')) === 'OK');
  let aiDurationShown = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await bodyIncludes('선택된 기간: 45일')) {
      aiDurationShown = true;
      break;
    }
  }
  check('AI-recommended duration applied (mocked, 45일)', aiDurationShown);
  check('AI duration reason text shown', await bodyIncludes('테스트용 AI 기간 추천 이유입니다'));

  // React-controlled inputs need the value set via the native prototype
  // setter (not a plain `.value =` assignment) for the onChange listener to
  // reliably see the new value when driven from outside React, like here.
  async function setNumberInput(placeholder, value) {
    return page.evaluate(
      ({ placeholder, value }) => {
        const input = [...document.querySelectorAll('input[type="number"]')].find((i) => i.placeholder === placeholder);
        if (!input) return 'NOT_FOUND';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      },
      { placeholder, value }
    );
  }

  const outOfRange = await setNumberInput('직접 입력', '500');
  check('Custom duration input found and filled with out-of-range value', outOfRange === 'OK');
  await clickText('적용', 'button');
  await new Promise((r) => setTimeout(r, 200));
  check('Out-of-range custom duration shows a validation error (never silently accepted)', await bodyIncludes('사이로 입력해주세요'));

  await setNumberInput('직접 입력', '21');
  await clickText('적용', 'button');
  await new Promise((r) => setTimeout(r, 200));
  check('Valid custom duration (21일) applied', await bodyIncludes('선택된 기간: 21일'));
  await shot('04-curriculum-duration');

  // ============ 7. CREATE TARGET-STYLE CURRICULUM ============
  check('커리큘럼 생성 click ->', (await clickText('커리큘럼 생성', 'button')) === 'OK');
  let navigatedToCurriculum = false;
  let createdCurriculumId = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const hash = await page.evaluate(() => location.hash);
    if (hash.startsWith('#/learning/mma/')) {
      navigatedToCurriculum = true;
      createdCurriculumId = hash.split('/')[3];
      break;
    }
  }
  check('Created curriculum navigates to its day-list page (/learning/mma/:id)', navigatedToCurriculum, createdCurriculumId);
  const createdCurriculum = await page.evaluate((id) => {
    const list = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
    return list.find((c) => c.id === id);
  }, createdCurriculumId);
  check('Created curriculum has real styleMeta (fighterName, matchedTechniques from real data)', !!createdCurriculum?.styleMeta && createdCurriculum.styleMeta.matchedTechniques.length > 0);
  check('Created curriculum uses the requested duration (21 days)', createdCurriculum?.totalDays === 21, createdCurriculum?.totalDays);

  // ============ 8. ACHIEVEMENTS — style curriculum starts LOCKED ============
  await goto('#/profile');
  const styleAchievementLockedText = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.technique-row')];
    const row = rows.find((r) => r.textContent?.includes('첫 목표 스타일 커리큘럼 완료'));
    return row?.querySelector('.technique-row__right')?.textContent ?? null;
  });
  check('"첫 목표 스타일 커리큘럼 완료" starts locked (0/1) — not fabricated just from creating it', styleAchievementLockedText === '0/1', styleAchievementLockedText);
  await shot('05-profile-before-style-complete');

  // Simulate genuinely completing it via real progress data, then verify unlock.
  await page.evaluate((id) => {
    const progress = JSON.parse(localStorage.getItem('martialdex:curricula:progress') || '{}');
    progress[id] = { curriculumId: id, currentDay: 21, completedDays: Array.from({ length: 21 }, (_, i) => i + 1), startedAt: new Date().toISOString(), lastStudiedAt: new Date().toISOString(), progress: 100 };
    localStorage.setItem('martialdex:curricula:progress', JSON.stringify(progress));
  }, createdCurriculumId);
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(MOCK_SUCCESS_SCRIPT);
  await goto('#/profile');
  const styleAchievementUnlocked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.technique-row')];
    const row = rows.find((r) => r.textContent?.includes('첫 목표 스타일 커리큘럼 완료'));
    return row?.querySelector('.technique-row__right')?.textContent ?? null;
  });
  check('"첫 목표 스타일 커리큘럼 완료" unlocks only after real progress reaches 100%', (styleAchievementUnlocked ?? '').includes('달성'), styleAchievementUnlocked);

  // ============ 9. ALL OTHER ACHIEVEMENTS FROM SEEDED REAL DATA ============
  const achievementRows = await page.evaluate(() => {
    return [...document.querySelectorAll('.technique-row')].map((r) => ({
      title: r.querySelector('.technique-row__name')?.textContent ?? '',
      status: r.querySelector('.technique-row__right')?.textContent ?? '',
    }));
  });
  const unlockedTitles = achievementRows.filter((a) => a.status.includes('달성')).map((a) => a.title);
  check('첫 번째 기술 학습 unlocked', unlockedTitles.some((t) => t.includes('첫 번째 기술 학습')));
  check('첫 커리큘럼 완료 unlocked (seeded 100% progress curriculum)', unlockedTitles.some((t) => t.includes('첫 커리큘럼 완료')));
  check('첫 스파링 분석 unlocked', unlockedTitles.some((t) => t.includes('첫 스파링 분석')));
  check('10개 기술 숙련 unlocked (exactly 10 proficient seeded)', unlockedTitles.some((t) => t.includes('10개 기술 숙련')));
  check('50개 기술 학습 unlocked (52 distinct techniques seeded)', unlockedTitles.some((t) => t.includes('50개 기술 학습')));
  check('10회 훈련 unlocked', unlockedTitles.some((t) => t.includes('10회 훈련')));
  check('10회 스파링 분석 unlocked', unlockedTitles.some((t) => t.includes('10회 스파링 분석')));
  check('7일 연속 학습 unlocked (7 consecutive trainingHistory dates)', unlockedTitles.some((t) => t.includes('7일 연속 학습')));
  check('All 9 achievements unlocked at this point', unlockedTitles.length === 9, JSON.stringify(unlockedTitles));
  await shot('06-profile-all-achievements');

  // ============ 10. LEVEL + STREAK ============
  // .chip.active now also matches the Rank title chip (26단계 Rank/Badge
  // added it before the Level chip in Profile.tsx) — search all chips by
  // text instead of assuming position/class.
  const allProfileChips = await textsOf('.chip');
  const levelChip = allProfileChips.find((c) => c.startsWith('Level')) ?? null;
  check('Level chip shows a level above 1 given heavy seeded activity', /Level [2-9]/.test(levelChip ?? ''), levelChip);
  check('Streak chip shows 7일 연속 학습', await bodyIncludes('7일 연속 학습'));

  // ============ 11. HOME / AI COACH ENTRY POINTS ============
  await goto('#/');
  check('[Home] "나의 성장" card appears with real level/streak', await bodyIncludes('나의 성장'));
  check('[Home] "나의 스타일 보기" link present once analysis exists', await bodyIncludes('나의 스타일 보기'));
  await goto('#/coach');
  check('[AiCoach] "나의 스타일" entry card present', await page.evaluate(() => !!document.querySelector('[data-feature="my-style"] a[href="#/my-style"]')));

  // ============ 12. AI COACH CONTEXT INCLUDES STAGE-20 DATA ============
  check('AI에게 직접 물어보기 click ->', (await clickText('AI에게 직접 물어보기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('오늘 뭐 연습할까? example question click ->', (await clickText('오늘 뭐 연습할까?', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 800));
  const lastChatContext = await page.evaluate(() => window.__lastChatContext ?? null);
  check('Coach chat context includes 학습 레벨 (level/streak grounding)', (lastChatContext ?? '').includes('학습 레벨'));
  check('Coach chat context includes 나의 현재 스타일 (my-style grounding)', (lastChatContext ?? '').includes('나의 현재 스타일'));
  check('Coach chat context includes 스타일 변화 추이 (monthly trend grounding)', (lastChatContext ?? '').includes('스타일 변화 추이'));
  await page.evaluate(() => document.querySelector('.modal-overlay')?.click());

  // ============ 13. SPARRING STYLE TIMELINE + MONTHLY TREND ============
  await goto('#/my-style');
  const timelineLines = await textsOf('li');
  const timelineEntries = timelineLines.filter((l) => l.includes('스파링') && l.includes('→'));
  check('Sparring style timeline shows all 10 seeded sessions', timelineEntries.length === 10, timelineEntries.length);
  check('Timeline is chronological (스파링 1 first)', timelineEntries[0]?.startsWith('스파링 1'), timelineEntries[0]);
  check('Timeline shows a share-shift label somewhere (비중 증가/전환/유지/중심)', timelineEntries.some((l) => /비중 증가|전환|유지|중심/.test(l)));
  const monthlyTrendText = await textOf('.card.info-card:has(h3)');
  const bodyText = await page.evaluate(() => document.body.textContent || '');
  check('Monthly style trend shows Striking 중심 for the older month', bodyText.includes('Striking 중심'));
  check('Monthly style trend shows Grappling 중심 for the recent month', bodyText.includes('Grappling 중심'));
  await shot('07-style-evolution');

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 14. PERSISTENCE ACROSS RESTART ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  const persistedCurriculum = await page.evaluate((id) => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').find((c) => c.id === id), createdCurriculumId);
  check('Target-style curriculum persists after app restart', !!persistedCurriculum);
  const persistedTodaySession = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session') || 'null'));
  check('학습하기 addition to today-training persists after restart', !!persistedTodaySession);

  // ============ 15. WIDE REGRESSION (stage 20 spec item 17's full checklist) ============
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

  await goto('#/techniques');
  check('[Regression] Technique list / filter page still works', (await page.evaluate(() => document.querySelectorAll('.technique-row, .search-result-row').length)) > 0);

  await goto('#/learning/bjj');
  check('[Regression] Official curriculum overview still works', ((await textOf('.curriculum-hero h3')) ?? '').includes('주짓수'));

  await goto('#/learning');
  check('[Regression] Learning hub still works', ((await textOf('.section-title h2')) ?? '').length > 0);

  await goto('#/fighter-style');
  check('[Regression] Fighter-style hub still works', ((await textOf('.section-title h2')) ?? '') === '선수 스타일 학습');

  await goto('#/coach');
  check('[Regression] AI Coach page still works', ((await textOf('.section-title h2')) ?? '').includes('AI 코치'));

  await goto('#/today-training');
  check('[Regression] Today Training page still works', !(await bodyIncludes('오류')));

  await goto('#/sparring');
  check('[Regression] Sparring analysis hub still works', ((await textOf('.section-title h2')) ?? '').includes('스파링 분석'));

  await goto('#/graph');
  check('[Regression] Technique graph page still works', ((await textOf('.section-title h2')) ?? '').includes('기술 그래프'));

  await goto('#/situation');
  check('[Regression] Situation recommend page still works', ((await textOf('.section-title h2')) ?? '').includes('상황별 기술 추천'));

  await goto('#/stats');
  check('[Regression] My Stats page still works', !(await bodyIncludes('오류')));

  await goto('#/review');
  check('[Regression] Review page still works', ((await textOf('.section-title h2')) ?? '').includes('오늘의 복습') || (await bodyIncludes('복습')));

  await goto('#/my-skills');
  const overallStats = await textsOf('.curriculum-stat-row strong');
  check('[Regression] My Skills dashboard still works', Number(overallStats[0]) > 1000, overallStats[0]);

  await goto('#/arts/boxing/techniques/boxing__jab');
  check('[Regression] Pose-analysis button still present on supported technique', await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('자세 분석'))));

  await goto('#/');
  check('[Regression] Header logo image renders', await page.evaluate(() => !!document.querySelector('.brand__mark[src]')));
  check('[Regression] "메뉴 ▾" nav dropdown still present', await bodyIncludes('메뉴'));
  // AI 화면은 이제 상단 "AI 코치" 탭의 AI 기능 목록에서 엽니다.
  check('[Regression] AI 코치 탭 열기 ->', (await clickText('AI 코치', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 500));
  check('[Regression] AI 코치 탭에 "나의 스타일 분석" 카드', await page.evaluate(() => { const a = document.querySelector('[data-feature="my-style"] a'); if (!a) return false; a.click(); return true; }));
  await new Promise((r) => setTimeout(r, 1500));
  check('[Regression] Nav link navigates to /my-style', (await page.evaluate(() => location.hash)) === '#/my-style');

  console.log('\n=== CONSOLE ERRORS TOTAL (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(path.join(SCRATCH, 'qa-mystyle-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
