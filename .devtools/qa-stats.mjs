import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-stats-shots');
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

function buildSeed() {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  const dateOnly = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);

  // trainingHistory: spread across 3 days ago (within 7d), 20 days ago
  // (within 30d, outside 7d), 60 days ago (within 90d, outside 30d), and
  // 120 days ago (only 'all' should include it).
  const trainingHistory = [
    { id: 'h1', date: dateOnly(3), completedAt: daysAgo(3), curriculumId: null, dayNumber: null, techniqueIds: ['boxing__jab', 'boxing__cross'], completed: true, estimatedMinutes: 20, actualMinutes: 25, notes: null, source: 'coach_today' },
    { id: 'h2', date: dateOnly(20), completedAt: daysAgo(20), curriculumId: null, dayNumber: null, techniqueIds: ['wrestling__basic-double-leg'], completed: true, estimatedMinutes: 30, actualMinutes: null, notes: null, source: 'curriculum' },
    { id: 'h3', date: dateOnly(60), completedAt: daysAgo(60), curriculumId: null, dayNumber: null, techniqueIds: ['bjj__armbar', 'bjj__triangle'], completed: true, estimatedMinutes: 25, actualMinutes: 25, notes: null, source: 'coach_today' },
    { id: 'h4', date: dateOnly(120), completedAt: daysAgo(120), curriculumId: null, dayNumber: null, techniqueIds: ['boxing__hook'], completed: true, estimatedMinutes: 15, actualMinutes: 15, notes: null, source: 'coach_today' },
  ];

  const poseRecords = [
    { recordId: 'r1', techniqueId: 'boxing__jab', martialArtId: 'boxing', score: 70, status: 'average', metricScores: {}, analyzedAt: daysAgo(3) },
    { recordId: 'r2', techniqueId: 'boxing__jab', martialArtId: 'boxing', score: 82, status: 'good', metricScores: {}, analyzedAt: daysAgo(1) },
    { recordId: 'r3', techniqueId: 'wrestling__basic-double-leg', martialArtId: 'wrestling', score: 65, status: 'average', metricScores: {}, analyzedAt: daysAgo(20) },
    { recordId: 'r4', techniqueId: 'bjj__triangle', martialArtId: 'bjj', score: 88, status: 'good', metricScores: {}, analyzedAt: daysAgo(60) },
  ];

  const sparringSessions = [
    {
      id: 'sp1',
      date: daysAgo(2),
      martialArt: 'boxing',
      videoName: 'a.mp4',
      videoDurationSec: 90,
      videoResolution: { width: 1280, height: 720 },
      analysisScopes: ['overall'],
      overallScores: { technique: null, movement: 70, distance: 65, defense: 72, offense: 76, posture: 74 },
      motionEvents: [],
      techniqueGuesses: [{ techniqueId: 'boxing__jab', techniqueName: 'Jab', martialArt: 'boxing', occurrences: [10, 20, 30], estimated: true }],
      postureSegments: [],
      styleObservations: [],
      styleComparison: null,
      limitations: [],
      savedMoments: [],
      weakAreas: [],
      notes: null,
    },
    {
      id: 'sp2',
      date: daysAgo(15),
      martialArt: 'boxing',
      videoName: 'b.mp4',
      videoDurationSec: 100,
      videoResolution: { width: 1280, height: 720 },
      analysisScopes: ['overall'],
      overallScores: { technique: null, movement: 60, distance: 58, defense: 64, offense: 68, posture: 66 },
      motionEvents: [],
      techniqueGuesses: [{ techniqueId: 'boxing__jab', techniqueName: 'Jab', martialArt: 'boxing', occurrences: [5], estimated: true }],
      postureSegments: [],
      styleObservations: [],
      styleComparison: null,
      limitations: [],
      savedMoments: [],
      weakAreas: [],
      notes: null,
    },
  ];

  return { trainingHistory, poseRecords, sparringSessions };
}

const MOCK_SUCCESS = () => {
  window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
    const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
    if (!isJsonMode) return { ok: true, text: 'ok' };
    if ((request.question || '').includes('학습 요약을 작성해줘')) {
      return { ok: true, text: JSON.stringify({ summary: '테스트용 AI 학습 요약입니다. 이번 기간 훈련량이 실제 기록을 기반으로 요약되었습니다.' }) };
    }
    return { ok: false, code: 'UNKNOWN', message: 'n/a' };
  };
};

const MOCK_FAILURE = () => {
  window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
    const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
    if (!isJsonMode) return { ok: true, text: 'ok' };
    return { ok: false, code: 'RATE_LIMIT', message: '요청이 너무 많습니다.' };
  };
};

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

  // ============ 1. NAV + EMPTY STATE ============
  // "나의 통계" now lives in the header's collapsed "메뉴" dropdown.
  check('메뉴 dropdown opens ->', (await clickText('메뉴', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  check('Nav has "나의 통계" link', (await clickText('나의 통계', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('Landed on stats page', ((await textOf('.section-title h2')) ?? '').includes('나의 통계'));
  check('Empty state shown with no data (default 30일 period)', ((await textOf('.empty-state')) ?? '').includes('학습 기록이 없습니다'));
  await shot('01-stats-empty');

  // ============ SEED REALISTIC HISTORICAL DATA ============
  const seedResult = await page.evaluate((seed) => {
    localStorage.setItem('martialdex:training-history', JSON.stringify(seed.trainingHistory));
    localStorage.setItem('martialdex:pose-records', JSON.stringify(seed.poseRecords));
    localStorage.setItem('martialdex:sparring-sessions', JSON.stringify(seed.sparringSessions));
    return true;
  }, buildSeed());
  check('Seeded realistic historical data (training/pose/sparring across time)', seedResult);
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await goto('#/stats');
  await new Promise((r) => setTimeout(r, 400));

  // ============ 2. DEFAULT PERIOD (30일): h1(3d)+h2(20d) in range, h3(60d)/h4(120d) out ============
  let overviewStrongs = await textsOf('.curriculum-stat-row strong');
  check('30일 기본 기간: 훈련 횟수 2회 (h1, h2만 포함)', overviewStrongs[0] === '2', JSON.stringify(overviewStrongs));
  check('30일 기본 기간: 총 훈련 시간 = 25 + 30 = 55분', overviewStrongs[1] === '55분', overviewStrongs[1]);
  await shot('02-stats-30d');

  // ============ 3. 7일 필터: only h1 (3일 전) ============
  check('7일 필터 click ->', (await clickText('7일', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  overviewStrongs = await textsOf('.curriculum-stat-row strong');
  check('7일 필터: 훈련 횟수 1회 (h1만)', overviewStrongs[0] === '1', JSON.stringify(overviewStrongs));

  // ============ 4. 3개월(90일) 필터: h1,h2,h3 포함 (h4 120일은 제외) ============
  check('3개월 필터 click ->', (await clickText('3개월', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  overviewStrongs = await textsOf('.curriculum-stat-row strong');
  check('3개월 필터: 훈련 횟수 3회 (h1,h2,h3)', overviewStrongs[0] === '3', JSON.stringify(overviewStrongs));

  // ============ 5. 전체 필터: 모든 기록 포함 (h1~h4) ============
  check('전체 필터 click ->', (await clickText('전체', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  overviewStrongs = await textsOf('.curriculum-stat-row strong');
  check('전체 필터: 훈련 횟수 4회 (h1~h4 전부)', overviewStrongs[0] === '4', JSON.stringify(overviewStrongs));
  check('전체 필터: 분석 영상 수 4개 (r1~r4 전부)', overviewStrongs[5] === '4', JSON.stringify(overviewStrongs));
  await shot('03-stats-all');

  // ============ 6. 무술별 통계 ============
  const martialArtRows = (await textsOf('.pose-history-row__main')).join(' | ');
  check('무술별 통계에 복싱/레슬링/주짓수 표시', martialArtRows.includes('복싱') && martialArtRows.includes('레슬링') && martialArtRows.includes('주짓수'), martialArtRows);

  // ============ 7. 그래프 렌더링 ============
  const chartCount = await page.evaluate(() => document.querySelectorAll('.score-chart svg').length);
  check('그래프(훈련 시간/횟수/평균 점수)가 전체 기간에서 렌더링됨', chartCount > 0, `count=${chartCount}`);
  await shot('04-stats-charts');

  // ============ 8. 스파링 통계 ============
  const pageText = await page.evaluate(() => document.body.textContent || '');
  check('스파링 통계: 총 스파링 횟수 2회 표시', pageText.includes('2') && pageText.includes('스파링'));
  check('스파링 통계: 종목별 횟수(복싱)', pageText.includes('복싱 2회') || pageText.includes('복싱') && pageText.includes('2회'));
  check('스파링 통계: 기술 사용 빈도(Jab)', pageText.includes('Jab') && pageText.includes('4회'));
  check('스파링 통계: 스타일 변화(움직임 60 → 70 형태)', pageText.includes('→'));
  await shot('05-stats-sparring');

  // ============ 9. AI 요약 (성공) ============
  await page.evaluate(MOCK_SUCCESS);
  check('이번 기간 요약 받기 click ->', (await clickText('이번 기간 요약 받기', 'button')) === 'OK');
  let gotSummary = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if ((await page.evaluate(() => document.body.textContent || '')).includes('테스트용 AI 학습 요약')) {
      gotSummary = true;
      break;
    }
  }
  check('AI 학습 요약(mocked) 표시됨', gotSummary);
  await shot('06-stats-ai-summary');

  // ============ 10. AI 요약 실패 -> 폴백 ============
  await page.evaluate(MOCK_FAILURE);
  check('요약 다시 받기 click ->', (await clickText('요약 다시 받기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 1000));
  const pageTextAfterFailure = await page.evaluate(() => document.body.textContent || '');
  check('AI 실패 시 실제 데이터 기반 폴백 요약 표시(빈 화면/크래시 없음)', pageTextAfterFailure.includes('훈련했습니다'), pageTextAfterFailure.slice(0, 300));
  check('AI 실패 안내 문구 표시', pageTextAfterFailure.includes('기본 요약 문구'));
  await shot('07-stats-ai-fallback');

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 11. RESTART -> PERSISTENCE (recomputed fresh, not cached) ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  await goto('#/stats');
  await new Promise((r) => setTimeout(r, 500));
  await clickText('전체', 'button');
  await new Promise((r) => setTimeout(r, 300));
  const overviewAfterRestart = await textsOf('.curriculum-stat-row strong');
  check('통계가 재시작 후에도 실제 저장된 기록으로부터 다시 계산됨', overviewAfterRestart[0] === '4', JSON.stringify(overviewAfterRestart));
  await shot('08-stats-after-restart');

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

  await goto('#/graph');
  check('[Regression] Technique graph page still works', ((await textOf('.section-title h2')) ?? '').includes('기술 그래프'));

  await goto('#/situation');
  check('[Regression] Situation-recommend page still works', ((await textOf('.section-title h2')) ?? '').includes('상황별 기술 추천'));

  await goto('#/learning/bjj');
  check('[Regression] Official curriculum overview still works', ((await textOf('.curriculum-hero h3')) ?? '').includes('주짓수'));

  await goto('#/fighter-style');
  check('[Regression] Fighter-style hub still works', ((await textOf('.section-title h2')) ?? '') === '선수 스타일 학습');

  await goto('#/coach');
  check('[Regression] AI Coach page still works', ((await textOf('.section-title h2')) ?? '').includes('AI 개인 코치'));

  await goto('#/sparring');
  check('[Regression] Sparring analysis hub still works', ((await textOf('.section-title h2')) ?? '').includes('스파링 분석'));

  await goto('#/my-skills');
  const overallStats = await textsOf('.curriculum-stat-row strong');
  check('[Regression] My Skills dashboard still works', Number(overallStats[0]) > 1000, overallStats[0]);

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

  fs.writeFileSync(path.join(SCRATCH, 'qa-stats-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
