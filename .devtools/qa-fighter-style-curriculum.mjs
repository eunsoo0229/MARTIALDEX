import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));

  const result = await page.evaluate(async () => {
    const { planStyleCurriculum } = await import('/src/lib/fighterStyle/curriculumPlanner.ts');
    const { searchTechniques } = await import('/src/lib/search.ts');
    const { classifyPhase } = await import('/src/lib/fighterStyle/phaseClassifier.ts');
    const { getTechnique } = await import('/src/lib/loadData.ts');
    const { saveNewStyleCurriculum } = await import('/src/lib/fighterStyle/styleCurriculumService.ts');
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');

    function buildSkewedMatches(terms) {
      const seen = new Map();
      for (const term of terms) for (const t of searchTechniques(term, 10)) if (!seen.has(t.id)) seen.set(t.id, t);
      return [...seen.values()].map((t, i) => {
        const tech = getTechnique(t.id);
        return { techniqueId: t.id, techniqueName: t.name, martialArt: t.martialArt, relevanceScore: 90 - i, reason: 'qa', phase: tech ? classifyPhase(tech) : 'entries' };
      });
    }

    const out = {};

    // A single-discipline striker's style analysis realistically produces a
    // match pool concentrated in 2-3 phases, leaving others thin or empty —
    // this is the shape that used to generate "관련 기술 없음" placeholder
    // days for any phase the fixed PHASE_BASE_WEIGHT allocated days to
    // regardless of how many real techniques it actually matched.
    const skewedMatches = buildSkewedMatches(['잽', '크로스']);
    out.skewedMatchCount = skewedMatches.length;

    for (const targetDays of [7, 30, 45, 180]) {
      const { days } = planStyleCurriculum({ fighterName: '테스트', matches: skewedMatches, targetDays, intensity: 'normal', userLevel: 'beginner' });
      const empty = days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length === 0).length;
      out[`days${targetDays}`] = { requested: targetDays, actual: days.length, emptyDays: empty };
    }

    // Balanced pool (regression guard — the fix must not change behavior when no phase is starved).
    const balancedMatches = buildSkewedMatches(['잽', '크로스', '훅', '어퍼컷', '니킥', '로우킥', '오버핸드', '페인트']);
    const balancedPlan = planStyleCurriculum({ fighterName: '테스트', matches: balancedMatches, targetDays: 30, intensity: 'normal', userLevel: 'beginner' });
    out.balanced = { matchCount: balancedMatches.length, actual: balancedPlan.days.length, emptyDays: balancedPlan.days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length === 0).length };

    // Save -> reload round trip.
    const saved = saveNewStyleCurriculum({
      fighterId: 'qa-fighter',
      fighterName: 'QA저장선수',
      styleAnalysis: { styleSummary: '', primaryStyles: [], keyTechniques: [], preferredPositions: [], offensiveConcepts: [], defensiveConcepts: [], distanceManagement: [], transitions: [] },
      matchedTechniques: skewedMatches,
      targetDays: 45,
      intensity: 'normal',
      userLevel: 'beginner',
      durationMode: 'user_selected',
    });
    const reloaded = getCurriculum(saved.id);
    out.saveReload = {
      savedTotalDays: saved.totalDays,
      savedDaysLength: saved.days.length,
      reloadedDaysLength: reloaded?.days.length,
      identical: JSON.stringify(saved.days) === JSON.stringify(reloaded?.days),
      emptyAfterReload: reloaded ? reloaded.days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length === 0).length : -1,
    };
    out.curriculumId = saved.id;

    return out;
  });

  check('Skewed-pool match count is realistic (>0, not the whole catalog)', result.skewedMatchCount > 0 && result.skewedMatchCount < 30, String(result.skewedMatchCount));
  for (const d of [7, 30, 45, 180]) {
    const r = result[`days${d}`];
    check(`[targetDays=${d}] totalDays matches actual day count`, r.requested === r.actual, JSON.stringify(r));
    check(`[targetDays=${d}] zero empty days`, r.emptyDays === 0, JSON.stringify(r));
  }
  check('Balanced (non-skewed) pool: no regression, still zero empty days', result.balanced.emptyDays === 0, JSON.stringify(result.balanced));
  check('Save -> reload: totalDays === days.length before and after', result.saveReload.savedTotalDays === result.saveReload.savedDaysLength && result.saveReload.savedDaysLength === result.saveReload.reloadedDaysLength, JSON.stringify(result.saveReload));
  check('Save -> reload: day content identical (no loss/duplication)', result.saveReload.identical);
  check('Save -> reload: zero empty days after reload', result.saveReload.emptyAfterReload === 0);

  // Clean up the QA curriculum from the dev profile's localStorage.
  await page.evaluate((id) => {
    const list = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
    localStorage.setItem('martialdex:curricula:custom', JSON.stringify(list.filter((c) => c.id !== id)));
  }, result.curriculumId);

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
