// Task 5 Part 1's required proof: 7 named scenarios (Wrestling takedown-defense/
// attack/single-leg-counter, Boxing jab-attack/defense, BJJ mount-escape, MMA
// cage-takedown-defense), each reporting REAL numeric pipeline results read
// directly off GoalCurriculumPreview's fields (research/discoveryStats/
// matchedTechniques/days) — not scraped logs, not claims.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SCENARIOS = [
  { key: 'Wrestling 테이크다운 방어', freeText: '레슬링에서 상대의 테이크다운을 막는 방어를 집중적으로 배우고 싶어', martialArt: 'wrestling', expectIntent: 'defense' },
  { key: 'Wrestling 테이크다운 공격', freeText: '레슬링에서 더블렉 테이크다운으로 상대를 넘기는 공격을 잘하고 싶어', martialArt: 'wrestling', expectIntent: 'attack' },
  { key: 'Wrestling 싱글렉 카운터', freeText: '상대가 싱글렉 테이크다운을 시도할 때 카운터하는 방법을 배우고 싶어', martialArt: 'wrestling', expectIntent: 'counter' },
  { key: 'Boxing 잽 공격', freeText: '복싱에서 잽을 활용한 공격을 강화하고 싶어', martialArt: 'boxing', expectIntent: 'attack' },
  { key: 'Boxing 잽 방어', freeText: '상대의 잽을 막아내는 방어 기술을 배우고 싶어', martialArt: 'boxing', expectIntent: 'defense' },
  { key: 'BJJ 마운트 탈출', freeText: '주짓수에서 상대에게 마운트를 당했을 때 탈출하는 방법을 배우고 싶어', martialArt: 'bjj', expectIntent: 'escape' },
  { key: 'MMA 케이지 테이크다운 방어', freeText: 'MMA에서 케이지에 몰렸을 때 테이크다운을 방어하는 능력을 키우고 싶어', martialArt: 'mma', expectIntent: 'defense' },
];

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  cleanEnv.GEMINI_MODEL = 'gemini-3.5-flash'; // gemini-3.6-flash's free-tier daily quota is exhausted from this session's earlier testing (separate quota bucket)
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);

  const allResults = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n=== ${scenario.key} :: "${scenario.freeText}" (${scenario.martialArt}) ===`);
    const outcome = await page.evaluate(
      async ({ freeText, martialArt }) => {
        const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
        const result = await generateGoalCurriculumPreview({
          freeText,
          martialArt,
          durationDays: 14,
          dailyMinutes: 30,
          skipClarifying: true,
        });
        return result;
      },
      { freeText: scenario.freeText, martialArt: scenario.martialArt }
    );

    if (!outcome.ok) {
      console.log(`FAIL — 생성 실패 :: code=${outcome.code} ${outcome.message ?? outcome.errors?.join(', ') ?? ''}`);
      allResults.push({ scenario: scenario.key, ok: false, code: outcome.code });
      await sleep(10000);
      continue;
    }

    const p = outcome.preview;
    const relevanceHigh = p.matchedTechniques.filter((m) => m.relevanceScore >= 70).length;
    const relevanceMid = p.matchedTechniques.filter((m) => m.relevanceScore >= 40 && m.relevanceScore < 70).length;
    const relevanceLow = p.matchedTechniques.filter((m) => m.relevanceScore < 40).length;
    const contentDays = p.days.filter((d) => d.techniqueIds.length > 0).length;
    const reviewDays = p.days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length > 0).length;
    const emptyDays = p.days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length === 0).length;
    const intents = p.analysis.intents;

    const summary = {
      scenario: scenario.key,
      resolvedIntents: intents,
      intentMatchesExpected: intents.includes(scenario.expectIntent),
      internetResearch: {
        researched: p.research.researchedCount,
        excludedOppositeCamp: p.research.excludedOppositeCampCount,
        mergedIntoDesired: p.research.mergedIntoDesiredCount,
        usedSearchGrounding: p.research.usedSearchGrounding,
        ok: p.research.ok,
      },
      discovery: {
        discoveredCount: p.discoveryStats.discoveredCount,
        newlyRegisteredCount: p.discoveryStats.newlyRegisteredCount,
      },
      finalCandidatePool: p.matchedTechniques.length,
      relevanceHigh,
      relevanceMid,
      relevanceLow,
      contentDays,
      reviewDays,
      emptyDays,
      totalDays: p.days.length,
      contentWarning: p.contentWarning ?? null,
      insufficientContent: p.insufficientContent ?? false,
    };
    console.log(JSON.stringify(summary, null, 2));
    allResults.push({ ...summary, ok: true });

    await sleep(10000); // stay under free-tier RPM across scenarios
  }

  console.log('\n=== FINAL 7-SCENARIO SUMMARY ===');
  for (const r of allResults) {
    console.log(`${r.ok ? 'OK' : 'FAILED'} — ${r.scenario}`);
  }
  const failedCount = allResults.filter((r) => !r.ok).length;
  console.log(`\n${allResults.length - failedCount}/${allResults.length} scenarios generated successfully`);

  await app.close();
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
