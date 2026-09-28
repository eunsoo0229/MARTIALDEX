// Real end-to-end verification against the LIVE Gemini API (spec section 23
// — "실제로 검색 요청이 발생하는가?" cannot be answered by a unit test) for the
// exact scenario reported broken: "테이크다운의 다양성을 알고 싶어". Also spot-
// checks scenario B (a non-diversity beginner curriculum, which MUST still
// include stance/hand-fighting/fundamentals — the fix must not swing the
// other way and start excluding them everywhere) so the new required
// `diversityRequested` field on GoalAnalysis doesn't quietly break ordinary
// generation. Costs real Gemini quota (2 calls per scenario: analyzeGoal +
// researchTechniquesForGoal, sometimes +1 for the bounded retry) — kept to
// 3 scenarios deliberately.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SCENARIOS = [
  {
    key: 'Scenario A — 테이크다운의 다양성',
    freeText: '테이크다운의 다양성을 알고 싶어',
    martialArt: 'wrestling',
    expectDiversity: true,
  },
  {
    key: 'Scenario B — 초보자 테이크다운 4주 커리큘럼',
    freeText: '초보자가 테이크다운을 배우기 위한 4주 커리큘럼을 만들어줘',
    martialArt: 'wrestling',
    expectDiversity: false,
  },
  {
    key: 'Scenario C — 싱글렉 집중',
    freeText: '싱글렉 테이크다운만 집중적으로 배우고 싶어',
    martialArt: 'wrestling',
    expectDiversity: false,
  },
];

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);

  const allResults = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n=== ${scenario.key} :: "${scenario.freeText}" ===`);
    const outcome = await page.evaluate(
      async ({ freeText, martialArt }) => {
        const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
        return generateGoalCurriculumPreview({ freeText, martialArt, durationDays: 14, dailyMinutes: 30, skipClarifying: true });
      },
      { freeText: scenario.freeText, martialArt: scenario.martialArt }
    );

    if (!outcome.ok) {
      console.log(`FAIL — 생성 실패 :: code=${outcome.code} ${outcome.message ?? outcome.errors?.join(', ') ?? ''}`);
      allResults.push({ scenario: scenario.key, ok: false, code: outcome.code, message: outcome.message ?? outcome.errors?.join(', ') });
      await sleep(8000);
      continue;
    }

    const p = outcome.preview;
    const roleCounts = {};
    for (const m of p.matchedTechniques) roleCounts[m.structureRole] = (roleCounts[m.structureRole] ?? 0) + 1;
    const scheduledIds = new Set(p.days.flatMap((d) => [...d.techniqueIds, ...d.reviewTechniqueIds]));
    const scheduledTechniques = p.matchedTechniques.filter((m) => scheduledIds.has(m.techniqueId));
    const scheduledRoleCounts = {};
    for (const m of scheduledTechniques) scheduledRoleCounts[m.structureRole] = (scheduledRoleCounts[m.structureRole] ?? 0) + 1;
    const lowPriorityRoles = new Set(['general_fundamental', 'movement', 'conditioning']);
    const scheduledLowPriorityCount = scheduledTechniques.filter((m) => lowPriorityRoles.has(m.structureRole)).length;
    const scheduledLowPriorityRatio = scheduledTechniques.length > 0 ? scheduledLowPriorityCount / scheduledTechniques.length : 0;

    const summary = {
      scenario: scenario.key,
      diversityRequested: p.analysis.diversityRequested,
      diversityMatchesExpected: p.analysis.diversityRequested === scenario.expectDiversity,
      research: {
        status: p.research.status,
        researchMode: p.research.researchMode,
        usedExternalWebSearch: p.research.usedExternalWebSearch,
        executedQueries: p.research.executedQueries,
        searchResultCount: p.research.searchResultCount,
        analyzedSourceCount: p.research.analyzedSourceCount,
        researchedCount: p.research.researchedCount,
        validResearchedCount: p.research.validResearchedCount,
        plannedQueries: p.research.plannedQueries,
        actualSearchQueries: p.research.actualSearchQueries,
        foundTechniques: p.research.foundTechniques,
        excludedTechniques: p.research.excludedTechniques,
        usedSearchGrounding: p.research.usedSearchGrounding,
      },
      matchedTechniqueCount: p.matchedTechniques.length,
      matchedTop10: p.matchedTechniques.slice(0, 10).map((m) => ({ name: m.techniqueName, score: m.relevanceScore, role: m.structureRole })),
      structureRoleCountsAllMatches: roleCounts,
      scheduledTechniqueCount: scheduledTechniques.length,
      structureRoleCountsScheduled: scheduledRoleCounts,
      scheduledLowPriorityRatio: Math.round(scheduledLowPriorityRatio * 100) / 100,
      totalDays: p.days.length,
      contentWarning: p.contentWarning ?? null,
      insufficientContent: p.insufficientContent ?? false,
    };
    console.log(JSON.stringify(summary, null, 2));
    allResults.push({ ...summary, ok: true });

    await sleep(9000); // stay under free-tier RPM across scenarios
  }

  console.log('\n=== FINAL LIVE-SCENARIO SUMMARY ===');
  for (const r of allResults) {
    console.log(`${r.ok ? 'OK' : 'FAILED'} — ${r.scenario}${r.ok ? ` :: diversityRequested=${r.diversityRequested} (expected match: ${r.diversityMatchesExpected}) :: scheduledLowPriorityRatio=${r.scheduledLowPriorityRatio}` : ` :: ${r.code} ${r.message ?? ''}`}`);
  }
  const failedCount = allResults.filter((r) => !r.ok).length;
  console.log(`\n${allResults.length - failedCount}/${allResults.length} scenarios generated successfully`);

  const scenarioA = allResults.find((r) => r.scenario.startsWith('Scenario A'));
  if (scenarioA?.ok) {
    console.log('\n=== Scenario A verdict (spec section 23 checklist) ===');
    console.log(`1. 실제 검색 요청 발생: ${scenarioA.research.status !== 'SEARCH_NOT_AVAILABLE' ? 'YES' : 'NO (config/auth issue — see status)'}`);
    console.log(`2. 검색 결과가 조사 결과 화면 데이터에 표시됨: ${scenarioA.research.foundTechniques.length > 0 || scenarioA.research.status === 'SEARCH_FAILED' ? 'YES' : 'CHECK MANUALLY'}`);
    console.log(`3. 검색 상태: ${scenarioA.research.status}`);
    console.log(`4. diversityRequested 정확히 인식됨: ${scenarioA.diversityMatchesExpected}`);
    console.log(`5. 최종 스케줄된 기술 중 일반 기본기/움직임/컨디셔닝 비율: ${scenarioA.scheduledLowPriorityRatio} (목표: 낮음)`);
    console.log(`6. 최종 매칭 상위 10개:`, scenarioA.matchedTop10.map((m) => `${m.name}(${m.role})`).join(', '));
  }

  await app.close();
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
