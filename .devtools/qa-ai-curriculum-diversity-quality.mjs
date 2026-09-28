// New coverage for this task's fixes to the AI curriculum pipeline — root
// cause was: 67/68 candidates reported to the user as "낮음(<40)" relevance
// were still being scheduled as if they were legitimate content, because
// (a) MIN_RELEVANCE(15) was far below the "low relevance" reporting bucket
// (40) and applied uniformly regardless of structural role, (b)
// fallbackTechniquePool only REORDERED supporting-role filler instead of
// EXCLUDING it, and its own scoring formula capped everything under 40
// regardless of quality, and (c) search-query generation glued raw Korean
// phrases into English templates. All fixed at the deterministic-logic
// layer, tested here without a network call; qa-ai-curriculum-research.mjs
// already covers the search-status state machine and doesn't need
// repeating. See qa-ai-curriculum-research-live.mjs for the real end-to-end
// Gemini scenario.
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

  // ---- 1. fallbackTechniquePool hard-excludes supporting roles under diversityRequested (real wrestling DB) ----
  const fallbackResults = await page.evaluate(async () => {
    const { fallbackTechniquePool } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    const withDiversity = fallbackTechniquePool('wrestling', 'intermediate', { limit: 60, diversityRequested: true });
    const withoutDiversity = fallbackTechniquePool('wrestling', 'intermediate', { limit: 60, diversityRequested: false });
    const roleCounts = (list) => list.reduce((acc, m) => { acc[m.structureRole] = (acc[m.structureRole] ?? 0) + 1; return acc; }, {});
    return {
      withDiversityCount: withDiversity.length,
      withDiversityRoles: roleCounts(withDiversity),
      withoutDiversityCount: withoutDiversity.length,
      withoutDiversityRoles: roleCounts(withoutDiversity),
      withDiversityMaxScore: Math.max(...withDiversity.map((m) => m.relevanceScore)),
      withDiversityMinScore: Math.min(...withDiversity.map((m) => m.relevanceScore)),
    };
  });
  console.log('[1] fallback pool roles:', JSON.stringify(fallbackResults, null, 2));
  const forbiddenRoles = ['setup', 'positional_skill', 'movement', 'conditioning', 'general_fundamental'];
  const hasForbidden = forbiddenRoles.some((r) => (fallbackResults.withDiversityRoles[r] ?? 0) > 0);
  check('[1] diversityRequested:true fallback pool contains ZERO setup/position/movement/conditioning/fundamental filler', !hasForbidden, fallbackResults.withDiversityRoles);
  check('[1b] diversityRequested:false fallback pool still legitimately includes fundamentals/setup (unchanged existing behavior)', (fallbackResults.withoutDiversityRoles.general_fundamental ?? 0) > 0 || (fallbackResults.withoutDiversityRoles.setup ?? 0) > 0, fallbackResults.withoutDiversityRoles);
  check('[1c] a primary technique from the diversity-mode fallback pool can score above the old 40-cap', fallbackResults.withDiversityMaxScore > 40, fallbackResults.withDiversityMaxScore);

  // ---- 2. matchGoalToTechniques: non-primary candidates need >=40 under diversityRequested, primary can still clear the old floor(15) ----
  const matcherGate = await page.evaluate(async () => {
    const { matchGoalToTechniques } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    const base = {
      martialArt: 'wrestling', estimatedLevel: 'intermediate', weaknesses: ['Hand Fighting', 'Collar Tie'], desiredStyle: [],
      // Real technique names that ARE in the wrestling DB, guaranteeing exact-substring
      // hits for both a genuine primary takedown and known supporting/setup techniques —
      // the exact combination the reported bug let all through indiscriminately.
      desiredTechniques: ['Double Leg', 'Ankle Pick', 'Hand Fighting', 'Collar Tie', 'Bridge'], goals: ['Body Lock'], priority: ['Double Leg'],
      intents: ['attack'], referencedFighterName: null, clarifyingQuestion: null,
      summary: '', suggestedDurationDays: 14, durationReason: '', searchTopics: [],
    };
    const withDiversity = matchGoalToTechniques({ ...base, diversityRequested: true }, 'wrestling');
    const withoutDiversity = matchGoalToTechniques({ ...base, diversityRequested: false }, 'wrestling');
    return {
      withDiversityLowSetup: withDiversity.filter((m) => m.structureRole !== 'primary_technique' && m.relevanceScore < 40).length,
      withDiversityAny: withDiversity.length,
      withDiversityPrimaryCount: withDiversity.filter((m) => m.structureRole === 'primary_technique').length,
      withoutDiversityLowSetup: withoutDiversity.filter((m) => m.structureRole !== 'primary_technique' && m.relevanceScore < 40).length,
    };
  });
  check('[2] under diversityRequested:true, real primary techniques (Double Leg/Ankle Pick/Body Lock) are actually matched', matcherGate.withDiversityPrimaryCount > 0, matcherGate);
  check('[2b] under diversityRequested:true, NO non-primary match scores below 40 (the raised gate)', matcherGate.withDiversityLowSetup === 0, matcherGate);
  check('[2c] diversityRequested:false lets at least one low-scoring non-primary match through (the OLD floor=15 behavior, unchanged for non-diversity goals)', matcherGate.withoutDiversityLowSetup > 0, matcherGate);

  // ---- 3. buildResearchAngles builds from clean searchTopics, never emits a Hangul-containing query ----
  const angleResults = await page.evaluate(async () => {
    const { buildResearchAngles } = await import('/src/lib/aiCurriculum/techniqueResearch.ts');
    const base = {
      martialArt: 'wrestling', estimatedLevel: 'intermediate', weaknesses: [], desiredStyle: ['다양한 테이크다운 스타일'],
      desiredTechniques: ['다양한 테이크다운'], goals: ['다양한 테이크다운 기술 습득'], priority: ['다양한 테이크다운'],
      intents: ['attack'], referencedFighterName: null, clarifyingQuestion: null,
      summary: '', suggestedDurationDays: 14, durationReason: '',
    };
    const withCleanTopics = buildResearchAngles({ ...base, diversityRequested: true, searchTopics: ['wrestling takedown', 'takedown variations'] }, true);
    const withoutSearchTopics = buildResearchAngles({ ...base, diversityRequested: true, searchTopics: [] }, true);
    return { withCleanTopics, withoutSearchTopics };
  });
  console.log('[3] angle results:', JSON.stringify(angleResults, null, 2));
  const HANGUL_RE_TEST = /[가-힣]/;
  check('[3] with clean searchTopics, every planned query is built from them (no raw Korean phrase mashup)', angleResults.withCleanTopics.every((q) => !HANGUL_RE_TEST.test(q) && (q.includes('wrestling takedown') || q.includes('takedown variations'))), angleResults.withCleanTopics);
  check('[3b] with empty searchTopics (legacy fallback), no planned query still contains raw Hangul', angleResults.withoutSearchTopics.every((q) => !HANGUL_RE_TEST.test(q)), angleResults.withoutSearchTopics);

  // ---- 4. validateCurriculumQuality — the new section-20 quality gate ----
  const qualityResults = await page.evaluate(async () => {
    const { validateCurriculumQuality } = await import('/src/lib/aiCurriculum/validator.ts');
    const mkMatch = (id, role) => [id, { techniqueId: id, techniqueName: id, martialArt: 'wrestling', relevanceScore: 50, reason: '', phase: 'position', structureRole: role }];
    const goodMatches = new Map([mkMatch('a', 'primary_technique'), mkMatch('b', 'primary_technique'), mkMatch('c', 'setup')]);
    const badMatches = new Map([mkMatch('a', 'setup'), mkMatch('b', 'setup'), mkMatch('c', 'primary_technique')]);
    const days = (ids) => [{ day: 1, title: '', description: '', learningGoals: ['x'], techniqueIds: ids, reviewTechniqueIds: [], difficulty: null, estimatedMinutes: 30 }];
    return {
      goodUnderDiversity: validateCurriculumQuality(days(['a', 'b', 'c']), goodMatches, true), // 2/3 primary = 0.67 >= 0.6 -> ok
      badUnderDiversity: validateCurriculumQuality(days(['a', 'b', 'c']), badMatches, true), // 1/3 primary = 0.33 < 0.6 -> not ok
      badButDiversityOff: validateCurriculumQuality(days(['a', 'b', 'c']), badMatches, false), // same content, diversity not requested -> always ok
      noNewContent: validateCurriculumQuality([{ day: 1, title: '', description: '', learningGoals: ['x'], techniqueIds: [], reviewTechniqueIds: ['a'], difficulty: null, estimatedMinutes: 30 }], goodMatches, true),
    };
  });
  console.log('[4] quality results:', JSON.stringify(qualityResults, null, 2));
  check('[4] 2/3 primary (67%) passes the 60% bar under diversityRequested', qualityResults.goodUnderDiversity.ok === true, qualityResults.goodUnderDiversity);
  check('[4b] 1/3 primary (33%) fails the 60% bar under diversityRequested', qualityResults.badUnderDiversity.ok === false, qualityResults.badUnderDiversity);
  check('[4c] the SAME 1/3-primary content is never flagged when diversityRequested is false (no regression for normal goals)', qualityResults.badButDiversityOff.ok === true, qualityResults.badButDiversityOff);
  check('[4d] a review-only day (no new content) never fails the gate', qualityResults.noNewContent.ok === true, qualityResults.noNewContent);

  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED ===`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
  }

  await app.close();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
