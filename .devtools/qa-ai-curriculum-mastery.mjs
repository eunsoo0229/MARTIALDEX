import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-aicur-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  // Set some real mastery data for wrestling BEFORE matching, to check reweighting.
  const setup = await page.evaluate(async () => {
    const { setOverride } = await import('/src/lib/skillProgress/overrideStore.ts');
    const { getTechniquesByMartialArt } = await import('/src/lib/loadData.ts');
    const wrestlingTechs = getTechniquesByMartialArt('wrestling');
    // Mark the first 15 techniques 'proficient' (already mastered), leave the rest untouched (not_started).
    const proficientIds = wrestlingTechs.slice(0, 15).map((t) => t.id);
    for (const id of proficientIds) setOverride(id, 'proficient');
    return { totalWrestling: wrestlingTechs.length, proficientIds };
  });
  check('[setup] 레슬링 기술 중 15개를 숙련으로 설정', setup.proficientIds.length === 15, String(setup.proficientIds.length));

  // ---- Deterministic pipeline test (no Gemini call): matchGoalToTechniques + planGoalCurriculum ----
  const result = await page.evaluate(async ({ proficientIds }) => {
    const { matchGoalToTechniques, fallbackTechniquePool } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    const { planGoalCurriculum } = await import('/src/lib/aiCurriculum/curriculumPlanner.ts');
    const { computeAllSkillProgress } = await import('/src/lib/skillProgress/weaknessEngine.ts');

    const masteryByTechniqueId = new Map();
    for (const { technique, progress } of computeAllSkillProgress()) masteryByTechniqueId.set(technique.id, progress.status);

    const analysis = {
      martialArt: 'wrestling',
      estimatedLevel: 'intermediate',
      weaknesses: ['takedown defense', 'sprawl'],
      desiredStyle: ['pressure wrestling'],
      desiredTechniques: ['double leg', 'ankle pick', 'underhook'],
      goals: ['테이크다운 정확도 향상', '스크램블 대응력 향상'],
      priority: ['double leg', 'takedown defense'],
      referencedFighterName: null,
      clarifyingQuestion: null,
      summary: 'test',
      suggestedDurationDays: 30,
      durationReason: 'test',
    };

    const withoutMastery = matchGoalToTechniques(analysis, 'wrestling');
    const withMastery = matchGoalToTechniques(analysis, 'wrestling', masteryByTechniqueId);

    // How many of the top 20 matches (by relevance) are techniques the user already marked 'proficient'?
    const top20NoMastery = withoutMastery.slice(0, 20).filter((m) => proficientIds.includes(m.techniqueId)).length;
    const top20WithMastery = withMastery.slice(0, 20).filter((m) => proficientIds.includes(m.techniqueId)).length;

    const fallback = fallbackTechniquePool('wrestling', 'intermediate', { masteryByTechniqueId, limit: 80 });

    const plan30 = planGoalCurriculum({
      subjectLabel: '레슬링 테스트',
      matches: withMastery.length >= 30 ? withMastery : [...withMastery, ...fallback],
      targetDays: 30,
      intensity: 'normal',
      userLevel: 'intermediate',
      masteryByTechniqueId,
    });

    const newDays = plan30.days.filter((d) => d.techniqueIds.length > 0).length;
    const reviewDays = plan30.days.filter((d) => d.techniqueIds.length === 0).length;
    const uniqueTechniquesTaught = new Set(plan30.days.flatMap((d) => d.techniqueIds)).size;
    const reviewedProficientCount = plan30.days.flatMap((d) => d.reviewTechniqueIds).filter((id) => proficientIds.includes(id)).length;

    return {
      matchCountWithoutMastery: withoutMastery.length,
      matchCountWithMastery: withMastery.length,
      fallbackCount: fallback.length,
      top20NoMastery,
      top20WithMastery,
      totalDays: plan30.days.length,
      newDays,
      reviewDays,
      uniqueTechniquesTaught,
      reviewedProficientCount,
      sampleDayTitles: plan30.days.slice(0, 6).map((d) => d.title),
    };
  }, { proficientIds: setup.proficientIds });

  console.log(JSON.stringify(result, null, 2));

  check('[AI-curriculum] targetDays(30)와 실제 생성된 day 수가 일치', result.totalDays === 30, String(result.totalDays));
  check('[AI-curriculum] 새 기술을 가르치는 day가 복습 전용 day보다 훨씬 많음 (학습 중심)', result.newDays >= result.reviewDays * 2, `new=${result.newDays} review=${result.reviewDays}`);
  check('[AI-curriculum] 실제로 가르치는 고유 기술 수가 충분함 (>=20)', result.uniqueTechniquesTaught >= 20, String(result.uniqueTechniquesTaught));
  check(
    '[AI-curriculum] 숙련도 반영 시 이미 숙련된 기술의 상위권 노출이 줄어듦',
    result.top20WithMastery <= result.top20NoMastery,
    `no-mastery-top20-proficient=${result.top20NoMastery} with-mastery-top20-proficient=${result.top20WithMastery}`
  );
  check('[AI-curriculum] 이미 숙련된 기술이 복습 대상으로 거의 선택되지 않음', result.reviewedProficientCount === 0, String(result.reviewedProficientCount));

  // ---- Same pipeline for real MMA (no mastery data at all — fresh art) ----
  const mmaResult = await page.evaluate(async () => {
    const { matchGoalToTechniques, fallbackTechniquePool } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    const { planGoalCurriculum } = await import('/src/lib/aiCurriculum/curriculumPlanner.ts');
    const analysis = {
      martialArt: 'mixed-martial-arts',
      estimatedLevel: 'beginner',
      weaknesses: ['takedown defense', 'ground control'],
      desiredStyle: ['pressure'],
      desiredTechniques: ['ground and pound', 'clinch', 'submission'],
      goals: ['종합적인 MMA 기본기'],
      priority: ['ground and pound'],
      referencedFighterName: null,
      clarifyingQuestion: null,
      summary: 'test',
      suggestedDurationDays: 21,
      durationReason: 'test',
    };
    const matches = matchGoalToTechniques(analysis, 'mixed-martial-arts');
    const fallback = matches.length < 15 ? fallbackTechniquePool('mixed-martial-arts', 'beginner', { limit: 30 }) : [];
    const byId = new Map(matches.map((m) => [m.techniqueId, m]));
    for (const m of fallback) if (!byId.has(m.techniqueId)) byId.set(m.techniqueId, m);
    const finalMatches = [...byId.values()];
    const plan = planGoalCurriculum({
      subjectLabel: 'MMA 테스트',
      matches: finalMatches,
      targetDays: 21,
      intensity: 'normal',
      userLevel: 'beginner',
    });
    return {
      matchCount: matches.length,
      finalMatchCount: finalMatches.length,
      totalDays: plan.days.length,
      newDays: plan.days.filter((d) => d.techniqueIds.length > 0).length,
      allTechniqueIdsAreMma: plan.days.flatMap((d) => d.techniqueIds).every((id) => id.startsWith('mixed-martial-arts__')),
      taughtCount: new Set(plan.days.flatMap((d) => d.techniqueIds)).size,
    };
  });
  console.log(JSON.stringify(mmaResult, null, 2));
  check('[MMA AI-curriculum] MMA 커리큘럼도 targetDays만큼 day 생성', mmaResult.totalDays === 21, String(mmaResult.totalDays));
  check('[MMA AI-curriculum] 실제 MMA 기술만 사용됨 (다른 무술 기술 혼입 없음)', mmaResult.allTechniqueIdsAreMma, String(mmaResult.allTechniqueIdsAreMma));
  check('[MMA AI-curriculum] 학습 day가 존재함', mmaResult.newDays > 0, String(mmaResult.newDays));

  check('[regression] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
