// Unit-level coverage for the research/search pipeline overhaul (Task:
// "AI 커리큘럼 조사/검색 시스템 전면 점검") — deliberately NOT hitting the real
// Gemini API here (no network, no quota cost, fast): every function tested
// below is a pure, deterministic helper by design (structureClassifier.ts,
// diversity.ts, techniqueResearch.ts's deriveSearchStatus), specifically so
// the search-failure/status-classification logic can be verified without
// depending on live network conditions. See qa-ai-curriculum-research-live.mjs
// for the real end-to-end Gemini scenario ("테이크다운의 다양성을 알고 싶어").
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);

  // ---- 1. classifyTechniqueStructure — spec section 7's exact named techniques ----
  const structureResults = await page.evaluate(async () => {
    const { classifyTechniqueStructure } = await import('/src/lib/aiCurriculum/structureClassifier.ts');
    const fixtures = [
      { name: 'Hand Fighting', category: '스탠딩 포지션 / 그립', positions: [] },
      { name: 'Bridge', category: '기본 움직임과 연결 기술', positions: [] }, // BJJ's catch-all category — must be caught by NAME, not category
      { name: 'Hip Escape', category: '기본 움직임과 연결 기술', positions: [] },
      { name: 'Wrestling Stance', category: '기본 자세와 움직임', positions: [] },
      { name: 'Basic Double Leg', category: '더블 레그', positions: [] },
      { name: 'Single Ankle Pick', category: '발목·무릎 공격', positions: [] },
      { name: 'Body Lock Takedown', category: '바디락 / 클린치', positions: [] },
      { name: 'Uchi Mata', category: '허리기술 --- Koshi Waza', positions: [] },
      { name: 'Sprawl', category: '방어', positions: [] },
      { name: 'Mount Escape', category: '탈출 (Escape)', positions: [] },
      { name: 'Single Leg Down Defense Counter', category: '리샷 / 카운터', positions: [] },
      { name: 'Takedown Entry (Sambo)', category: '테이크다운 진입 (레슬링 계열)', positions: [] }, // must win over generic "진입"
      { name: 'Kumi Kata Grip', category: '잡기 / 그립 --- Kumi Kata', positions: [] },
      { name: 'Top Position Control', category: '탑 포지션', positions: [] },
    ];
    return fixtures.map((f) => ({ name: f.name, role: classifyTechniqueStructure(f) }));
  });
  const expected = {
    'Hand Fighting': 'general_fundamental',
    Bridge: 'movement',
    'Hip Escape': 'movement',
    'Wrestling Stance': 'general_fundamental',
    'Basic Double Leg': 'primary_technique',
    'Single Ankle Pick': 'primary_technique',
    'Body Lock Takedown': 'primary_technique',
    'Uchi Mata': 'primary_technique',
    Sprawl: 'primary_technique', // structural role is orthogonal to intent — "방어" is still a NAMED technique, just a defensive one
    'Mount Escape': 'escape',
    'Single Leg Down Defense Counter': 'counter',
    'Takedown Entry (Sambo)': 'primary_technique',
    'Kumi Kata Grip': 'setup',
    'Top Position Control': 'positional_skill',
  };
  for (const r of structureResults) {
    check(`[1] classifyTechniqueStructure("${r.name}") === ${expected[r.name]}`, r.role === expected[r.name], `got ${r.role}`);
  }

  // ---- 2. resolveDiversityRequested — spec section 6's trigger phrases + the negative case (scenario B) ----
  const diversityResults = await page.evaluate(async () => {
    const { resolveDiversityRequested } = await import('/src/lib/aiCurriculum/diversity.ts');
    const base = { diversityRequested: false, summary: '', goals: [], weaknesses: [], desiredTechniques: [] };
    const cases = [
      ['테이크다운의 다양성을 알고 싶어', true],
      ['테이크다운의 여러 종류를 알려줘', true],
      ['다양한 기술을 폭넓게 배우고 싶어', true],
      ['I want to learn the variety of takedowns', true],
      ['different types of single leg takedowns', true],
      ['초보자가 테이크다운을 배우기 위한 4주 커리큘럼을 만들어줘', false],
      ['싱글렉 테이크다운만 집중적으로 배우고 싶어', false],
      ['복싱 풋워크가 부족해', false],
    ];
    return cases.map(([text, expect]) => ({ text, expect, got: resolveDiversityRequested(base, text) }));
  });
  for (const r of diversityResults) {
    check(`[2] resolveDiversityRequested("${r.text}") === ${r.expect}`, r.got === r.expect, `got ${r.got}`);
  }
  // Gemini's own field saying true must be trusted even with no keyword in the text.
  const trustsAiField = await page.evaluate(async () => {
    const { resolveDiversityRequested } = await import('/src/lib/aiCurriculum/diversity.ts');
    return resolveDiversityRequested({ diversityRequested: true, summary: '', goals: [], weaknesses: [], desiredTechniques: [] }, '테이크다운을 배우고 싶어');
  });
  check('[2b] resolveDiversityRequested trusts an explicit AI-field true with no keyword match', trustsAiField === true);

  // ---- 3. selectDiverseTechniques — family cap + never-drops guarantee (spec 14/15) ----
  const diversitySelection = await page.evaluate(async () => {
    const { selectDiverseTechniques } = await import('/src/lib/aiCurriculum/diversity.ts');
    const mk = (name, score, role = 'primary_technique') => ({ techniqueId: name, techniqueName: name, martialArt: 'wrestling', relevanceScore: score, reason: '', phase: 'entries', structureRole: role });
    const matches = [
      mk('Basic Double Leg', 90),
      mk('Double Leg from Tie', 88),
      mk('Double Leg from Underhook', 85),
      mk('Double Leg Finish', 80),
      mk('Single Ankle Pick', 78),
      mk('Double Ankle Pick', 75),
      mk('Body Lock Takedown', 70),
      mk('Fireman\'s Carry', 65),
    ];
    const offOrdered = selectDiverseTechniques(matches, { diversityRequested: false, maxPerFamily: 2 });
    const onOrdered = selectDiverseTechniques(matches, { diversityRequested: true, maxPerFamily: 2 });
    return {
      offUnchanged: JSON.stringify(offOrdered.map((m) => m.techniqueName)) === JSON.stringify(matches.map((m) => m.techniqueName)),
      onCount: onOrdered.length,
      onFirstFour: onOrdered.slice(0, 4).map((m) => m.techniqueName),
      onAllNamesPresent: matches.every((m) => onOrdered.some((o) => o.techniqueName === m.techniqueName)),
    };
  });
  check('[3] diversityRequested:false leaves match order completely untouched', diversitySelection.offUnchanged);
  check('[3b] diversityRequested:true never drops a match (count preserved)', diversitySelection.onCount === 8, diversitySelection.onCount);
  check('[3c] diversityRequested:true never drops a match (every name still present)', diversitySelection.onAllNamesPresent);
  const doubleLegCountInFirstFour = diversitySelection.onFirstFour.filter((n) => n.toLowerCase().includes('double leg')).length;
  check('[3d] at most maxPerFamily(2) "Double Leg" variants rank in the top 4 once diversity reordering kicks in', doubleLegCountInFirstFour <= 2, diversitySelection.onFirstFour);

  // ---- 4. deriveSearchStatus — spec section 12's Test 1-5 ----
  const statusResults = await page.evaluate(async () => {
    const { deriveSearchStatus } = await import('/src/lib/aiCurriculum/techniqueResearch.ts');
    return {
      test1: deriveSearchStatus({ ok: true, usedSearchGrounding: true, rawCount: 8, keptCount: 7 }),
      test2: deriveSearchStatus({ ok: false, code: 'NETWORK', usedSearchGrounding: false, rawCount: 0, keptCount: 0 }),
      test3: deriveSearchStatus({ ok: true, usedSearchGrounding: true, rawCount: 0, keptCount: 0 }),
      test4: deriveSearchStatus({ ok: true, usedSearchGrounding: true, rawCount: 8, keptCount: 1 }),
      test5NoApiKey: deriveSearchStatus({ ok: false, code: 'NO_API_KEY', usedSearchGrounding: false, rawCount: 0, keptCount: 0 }),
      test5InvalidKey: deriveSearchStatus({ ok: false, code: 'INVALID_API_KEY', usedSearchGrounding: false, rawCount: 0, keptCount: 0 }),
      test5Unauthorized: deriveSearchStatus({ ok: false, code: 'UNAUTHORIZED', usedSearchGrounding: false, rawCount: 0, keptCount: 0 }),
      success: deriveSearchStatus({ ok: true, usedSearchGrounding: true, rawCount: 8, keptCount: 8 }),
    };
  });
  check('[4-Test1] normal API response → SEARCH_SUCCESS', statusResults.test1 === 'SEARCH_SUCCESS', statusResults.test1);
  check('[4-Test2] network/timeout failure → SEARCH_FAILED', statusResults.test2 === 'SEARCH_FAILED', statusResults.test2);
  check('[4-Test3] empty array (HTTP ok, zero results) → SEARCH_FAILED (never silently "success")', statusResults.test3 === 'SEARCH_FAILED', statusResults.test3);
  check('[4-Test4] results present but mostly filtered out → SEARCH_PARTIAL', statusResults.test4 === 'SEARCH_PARTIAL', statusResults.test4);
  check('[4-Test5a] NO_API_KEY → SEARCH_NOT_AVAILABLE (not SEARCH_FAILED)', statusResults.test5NoApiKey === 'SEARCH_NOT_AVAILABLE', statusResults.test5NoApiKey);
  check('[4-Test5b] INVALID_API_KEY → SEARCH_NOT_AVAILABLE', statusResults.test5InvalidKey === 'SEARCH_NOT_AVAILABLE', statusResults.test5InvalidKey);
  check('[4-Test5c] UNAUTHORIZED (not logged in) → SEARCH_NOT_AVAILABLE', statusResults.test5Unauthorized === 'SEARCH_NOT_AVAILABLE', statusResults.test5Unauthorized);
  check('[4-sanity] full success (rawCount===keptCount) → SEARCH_SUCCESS', statusResults.success === 'SEARCH_SUCCESS', statusResults.success);

  // ---- 5. namesLikelySame — used to line up a researched name with its real matched technique ----
  const nameMatchResults = await page.evaluate(async () => {
    const { namesLikelySame } = await import('/src/lib/aiCurriculum/diversity.ts');
    return {
      sameFamily: namesLikelySame('Double Leg Takedown', 'Basic Double Leg'),
      different: namesLikelySame('Double Leg Takedown', 'Single Leg Takedown'),
      exact: namesLikelySame('Ankle Pick', 'Ankle Pick'),
    };
  });
  check('[5] "Double Leg Takedown" ~= "Basic Double Leg" (same technique, different phrasing)', nameMatchResults.sameFamily === true);
  check('[5b] "Double Leg Takedown" != "Single Leg Takedown" (genuinely different technique)', nameMatchResults.different === false);
  check('[5c] exact name always matches itself', nameMatchResults.exact === true);

  // ---- 6. matchGoalToTechniques end-to-end (no network — matching/classification only) — structural demotion fires ONLY when diversityRequested ----
  const matcherResults = await page.evaluate(async () => {
    const { matchGoalToTechniques } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    const baseAnalysis = {
      martialArt: 'wrestling',
      estimatedLevel: 'intermediate',
      weaknesses: ['핸드파이팅', '테이크다운 다양성'],
      desiredStyle: [],
      desiredTechniques: ['Hand Fighting', 'Double Leg', 'Ankle Pick', 'Body Lock', 'Bridge'],
      goals: ['테이크다운의 다양성을 알고 싶어'],
      priority: ['테이크다운 다양성'],
      intents: ['attack'],
      referencedFighterName: null,
      clarifyingQuestion: null,
      summary: '테이크다운 다양성 학습',
      suggestedDurationDays: 14,
      durationReason: '',
    };
    const withDiversity = matchGoalToTechniques({ ...baseAnalysis, diversityRequested: true }, 'wrestling');
    const withoutDiversity = matchGoalToTechniques({ ...baseAnalysis, diversityRequested: false }, 'wrestling');
    const rank = (matches, namePart) => matches.findIndex((m) => m.techniqueName.toLowerCase().includes(namePart.toLowerCase()));
    return {
      withDiversityTop5: withDiversity.slice(0, 5).map((m) => ({ name: m.techniqueName, role: m.structureRole, score: m.relevanceScore })),
      handFightingRankDiversity: rank(withDiversity, 'hand fighting'),
      handFightingRankNoDiversity: rank(withoutDiversity, 'hand fighting'),
      bridgeRankDiversity: rank(withDiversity, 'bridge'),
      doubleLegRankDiversity: rank(withDiversity, 'double leg'),
    };
  });
  console.log('[6] matcher output (diversity mode) top 5:', JSON.stringify(matcherResults.withDiversityTop5, null, 2));
  const handFightingDemoted =
    matcherResults.handFightingRankDiversity === -1 ||
    matcherResults.handFightingRankNoDiversity === -1 ||
    matcherResults.handFightingRankDiversity > matcherResults.handFightingRankNoDiversity ||
    (matcherResults.doubleLegRankDiversity !== -1 && matcherResults.doubleLegRankDiversity < matcherResults.handFightingRankDiversity);
  check(
    '[6] under diversityRequested:true, "Hand Fighting" ranks no better than (usually worse than) a real takedown like Double Leg',
    matcherResults.doubleLegRankDiversity === -1 || matcherResults.handFightingRankDiversity === -1 || matcherResults.doubleLegRankDiversity <= matcherResults.handFightingRankDiversity,
    matcherResults
  );

  console.log('\n=== SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} PASSED`);
  if (failed.length > 0) {
    console.log('FAILURES:');
    for (const f of failed) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
  }

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
