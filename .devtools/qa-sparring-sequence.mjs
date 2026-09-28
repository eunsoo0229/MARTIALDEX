// Deterministic unit test for sequenceAnalysis.ts (Part A of the sparring
// coaching upgrade) — pure function, no Gemini call, no video, so this runs
// instantly and costs zero API quota. Verifies the core guarantees: real
// A->B pattern counting, solo-vs-combination classification, repeated-
// pattern detection, and the reactive/initiating ratio derived from a
// synthetic opponent motion timeline.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + JSON.stringify(detail) : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith('http://localhost:5173'));
    if (!page) await sleep(300);
  }
  if (!page) page = await app.firstWindow();
  await page.waitForLoadState('load');
  await sleep(1000);

  const out = await page.evaluate(async () => {
    const { analyzeSequences } = await import('/src/lib/sparringAnalysis/sequenceAnalysis.ts');

    const guesses = [
      { techniqueId: 'jab', techniqueName: 'JAB', martialArt: 'boxing', occurrences: [1, 5, 20, 21.5, 100], estimated: true },
      { techniqueId: 'cross', techniqueName: 'CROSS', martialArt: 'boxing', occurrences: [2], estimated: true },
      { techniqueId: 'lowkick', techniqueName: 'LOW KICK', martialArt: 'boxing', occurrences: [22], estimated: true },
    ];

    const noOpponent = analyzeSequences(guesses, [], [], [], null);
    const withOpponent = analyzeSequences(guesses, [], [], [], [{ timestampSec: 0.5, category: 'strike_like', label: 'x', confidence: 'low' }]);

    // Repeated-pattern case: JAB->CROSS 3 times, well-separated clusters.
    const repeatedGuesses = [
      { techniqueId: 'jab', techniqueName: 'JAB', martialArt: 'boxing', occurrences: [1, 20, 40], estimated: true },
      { techniqueId: 'cross', techniqueName: 'CROSS', martialArt: 'boxing', occurrences: [2, 21, 41], estimated: true },
    ];
    const repeated = analyzeSequences(repeatedGuesses, [], [], [], null);

    return {
      timelineLength: noOpponent.timeline.length,
      soloCount: noOpponent.soloCount,
      combinationCount: noOpponent.combinationCount,
      patterns: noOpponent.patterns,
      jabStats: noOpponent.perTechnique.find((t) => t.techniqueId === 'jab'),
      reactiveRatioNull: noOpponent.reactiveRatio,
      reactiveRatioWithOpponent: withOpponent.reactiveRatio,
      initiatingRatioWithOpponent: withOpponent.initiatingRatio,
      repeatedPatterns: repeated.repeatedPatterns,
    };
  });

  console.log(JSON.stringify(out, null, 2));

  check('[1] 전체 타임라인 길이 = 실제 발생 횟수 합(7)', out.timelineLength === 7, out.timelineLength);
  check('[2] soloCount(1) + combinationCount(6) = 전체(7)', out.soloCount === 1 && out.combinationCount === 6, { solo: out.soloCount, combo: out.combinationCount });
  check(
    '[3] JAB→CROSS 패턴이 실제로 1회 카운트됨',
    out.patterns.some((p) => p.fromTechniqueId === 'jab' && p.toTechniqueId === 'cross' && p.count === 1),
    out.patterns
  );
  check(
    '[4] JAB→후속없음 패턴이 실제로 2회 카운트됨(고립된 t=5, t=100)',
    out.patterns.some((p) => p.fromTechniqueId === 'jab' && p.toTechniqueId === null && p.count === 2),
    out.patterns
  );
  check('[5] JAB 기술별 통계: occurrenceCount=5', out.jabStats?.occurrenceCount === 5, out.jabStats);
  check('[6] 상대 추적 데이터 없으면 reactiveRatio는 null(0으로 지어내지 않음)', out.reactiveRatioNull === null, out.reactiveRatioNull);
  check(
    '[7] 상대 동작(0.5초) 직후 반응형 발생 비율이 실측대로 계산됨(2/7 ≈ 0.286)',
    out.reactiveRatioWithOpponent !== null && Math.abs(out.reactiveRatioWithOpponent - 2 / 7) < 0.01,
    out.reactiveRatioWithOpponent
  );
  check(
    '[8] reactiveRatio + initiatingRatio = 1',
    out.reactiveRatioWithOpponent !== null && out.initiatingRatioWithOpponent !== null && Math.abs(out.reactiveRatioWithOpponent + out.initiatingRatioWithOpponent - 1) < 1e-9,
    { r: out.reactiveRatioWithOpponent, i: out.initiatingRatioWithOpponent }
  );
  check(
    '[9] 3회 반복된 JAB→CROSS 패턴이 repeatedPatterns(임계 3회)에 포함됨',
    out.repeatedPatterns.some((p) => p.fromTechniqueId === 'jab' && p.toTechniqueId === 'cross' && p.count === 3),
    out.repeatedPatterns
  );

  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED ===`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(` - ${f.name}`);
  }

  await app.close();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
