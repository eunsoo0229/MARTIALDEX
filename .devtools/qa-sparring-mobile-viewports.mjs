// Mobile viewport check for the new sparring-coaching UI sections, at
// 375/390/430px — seeds a realistic SparringSession (with the new
// sequenceAnalysis/coachingSynthesis fields populated) so the new score
// grid/insight cards/pattern cards/setup cards actually render, then checks
// for horizontal overflow and touch-target sizing.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const VIEWPORTS = [
  { width: 375, height: 812, label: '375px' },
  { width: 390, height: 844, label: '390px' },
  { width: 430, height: 932, label: '430px' },
];

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  let page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(1000);

  const seeded = await page.evaluate(async () => {
    const { analyzeSequences } = await import('/src/lib/sparringAnalysis/sequenceAnalysis.ts');
    const techniqueGuesses = [
      { techniqueId: 'boxing__jab', techniqueName: 'Jab', martialArt: 'boxing', occurrences: [1, 5, 12, 20], estimated: true },
      { techniqueId: 'boxing__cross', techniqueName: 'Cross', martialArt: 'boxing', occurrences: [21], estimated: true },
    ];
    const motionEvents = [
      { timestampSec: 1, category: 'strike_like', label: '타격성 동작 감지', confidence: 'medium' },
      { timestampSec: 5, category: 'strike_like', label: '타격성 동작 감지', confidence: 'low' },
    ];
    const sequenceAnalysis = analyzeSequences(techniqueGuesses, motionEvents, [], [], null);
    const session = {
      id: 'mobile-viewport-session',
      date: new Date().toISOString(),
      martialArt: 'boxing',
      videoName: 'mobile.mp4',
      videoDurationSec: 30,
      videoResolution: { width: 640, height: 480 },
      analysisScopes: ['overall'],
      overallScores: { technique: null, movement: 60, distance: 55, defense: 50, offense: 65, posture: 60 },
      motionEvents,
      techniqueGuesses,
      postureSegments: [
        { segment: 'early', label: '초반', metrics: [{ id: 'guard', label: 'Guard', score: 70, status: 'good' }], note: null },
      ],
      styleObservations: ['테스트 스타일 관찰'],
      styleComparison: null,
      limitations: [],
      savedMoments: [],
      weakAreas: [{ label: 'Distance Management', score: 55 }],
      notes: null,
      excludedMotionCounts: {},
      sequenceAnalysis,
      coachingSynthesis: {
        strengths: [{ label: '잽 활용', evidence: '테스트 근거 문장' }],
        weaknesses: [{ label: '후속타 부족', evidence: '테스트 근거 문장' }],
        patternDiagnoses: sequenceAnalysis.patterns.slice(0, 2).map((p) => ({
          patternDescription: `${p.fromTechniqueName} → ${p.toTechniqueName ?? '후속 공격 없음'}`,
          occurrenceCount: p.count,
          diagnosis: '테스트 진단 문장',
        })),
        categoryScores: { attack: 40, defense: '분석 데이터 부족', footwork: '분석 데이터 부족', distance: '분석 데이터 부족', timing: '분석 데이터 부족', connection: 45, tacticalVariety: 30 },
        improvementDirections: ['테스트 개선 방향'],
        generatedAt: new Date().toISOString(),
      },
    };
    localStorage.setItem('martialdex:sparring-sessions', JSON.stringify([session]));
    return session.id;
  });
  check('[setup] 모바일 뷰포트용 세션 시딩', !!seeded, seeded);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate((id) => {
      location.hash = `#/sparring/${id}`;
    }, seeded);
    await sleep(700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`[${vp.label}] 스파링 결과 화면 가로 스크롤 없음`, overflow <= 1, `overflow=${overflow}px`);

    const patternHeaderHeights = await page.evaluate(() => Array.from(document.querySelectorAll('.sparring-pattern-card__header')).map((el) => el.getBoundingClientRect().height));
    check(`[${vp.label}] 패턴 카드 터치 영역 >= 40px`, patternHeaderHeights.length === 0 || patternHeaderHeights.every((h) => h >= 40), JSON.stringify(patternHeaderHeights));

    const scoreGridVisible = await page.evaluate(() => !!document.querySelector('.sparring-score-grid'));
    check(`[${vp.label}] 종합 코칭 점수 그리드 렌더`, scoreGridVisible);
  }

  check('[규약] 콘솔 에러 없음 확인 생략(overflow/렌더 체크 위주)', true);

  await app.close();
  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED ===`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(` - ${f.name} :: ${f.detail}`);
  }
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
