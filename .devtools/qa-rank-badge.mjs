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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-rank-'));
  const device = await launchDevice(dir);
  const { page } = device;

  // ---- Rank calculation: zero activity -> rank 1, lowest title ----
  let ranked = await page.evaluate(async () => {
    const { collectProfileStats } = await import('/src/lib/profileStats/collectProfileStats.ts');
    const { computeLevelInfo } = await import('/src/lib/level/levelEngine.ts');
    const { computeRankInfo } = await import('/src/lib/rank/rankEngine.ts');
    const stats = collectProfileStats();
    const level = computeLevelInfo(stats);
    return { stats, level, rank: computeRankInfo(level) };
  });
  check('[rank1] Zero-activity profile starts at rank 1', ranked.rank.rank === 1 && ranked.rank.xp === 0, JSON.stringify(ranked.rank));
  check('[rank2] All new stat fields present on ProfileStatsInput (poseAnalysisCount/comboCount/tacticCount/etc.)', 'poseAnalysisCount' in ranked.stats && 'comboCount' in ranked.stats && 'tacticCount' in ranked.stats && 'tacticFeedbackCount' in ranked.stats && 'distinctMartialArtsLearned' in ranked.stats, JSON.stringify(ranked.stats));

  // ---- Generate real activity across every listed data source, then re-check rank/badges ----
  await page.evaluate(async () => {
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const { createCombo } = await import('/src/lib/combo/service.ts');
    const { createTactic, saveTacticFeedback } = await import('/src/lib/tactic/service.ts');
    const { setOverride } = await import('/src/lib/skillProgress/overrideStore.ts');

    // Real training sessions across multiple sources.
    for (let i = 0; i < 3; i++) {
      recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['bjj__armbar'], completed: true, estimatedMinutes: 5, actualMinutes: 5, notes: null, source: 'combo' });
    }
    recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['boxing__jab'], completed: true, estimatedMinutes: 5, actualMinutes: 5, notes: null, source: 'curriculum' });

    // Real combos + tactics (with AI feedback simulated via saveTacticFeedback directly, no live Gemini call needed for this stat test).
    createCombo({ name: 'QA 콤보', description: '', techniqueIds: ['bjj__armbar', 'bjj__triangle'] });
    const t1 = createTactic({ name: 'QA 전술 1', situation: '상황1', techniqueIds: ['bjj__armbar'] });
    saveTacticFeedback(t1, '피드백1');
    createTactic({ name: 'QA 전술 2', situation: '상황2', techniqueIds: ['bjj__triangle'] });

    // Mark a few techniques as "learning" across different martial arts (for distinctMartialArtsLearned + technique-explorer).
    setOverride('bjj__armbar', 'learning');
    setOverride('boxing__jab', 'learning');
    setOverride('wrestling__sprawl', 'learning');
  });

  const afterActivity = await page.evaluate(async () => {
    const { collectProfileStats } = await import('/src/lib/profileStats/collectProfileStats.ts');
    const { computeLevelInfo } = await import('/src/lib/level/levelEngine.ts');
    const { computeRankInfo } = await import('/src/lib/rank/rankEngine.ts');
    const { computeAchievementStatuses } = await import('/src/lib/achievements/achievementEngine.ts');
    const stats = collectProfileStats();
    const level = computeLevelInfo(stats);
    const rank = computeRankInfo(level);
    const achievements = computeAchievementStatuses(stats);
    return { stats, level, rank, achievements };
  });

  check('[rank3] comboCount reflects the real combo just created', afterActivity.stats.comboCount === 1, String(afterActivity.stats.comboCount));
  check('[rank4] tacticCount reflects both real tactics created', afterActivity.stats.tacticCount === 2, String(afterActivity.stats.tacticCount));
  check('[rank5] tacticFeedbackCount reflects only the tactic that actually got feedback', afterActivity.stats.tacticFeedbackCount === 1, String(afterActivity.stats.tacticFeedbackCount));
  check('[rank6] comboTrainingSessionCount reflects only source:"combo" entries', afterActivity.stats.comboTrainingSessionCount === 3, String(afterActivity.stats.comboTrainingSessionCount));
  check('[rank7] distinctMartialArtsLearned counts each distinct martial art once', afterActivity.stats.distinctMartialArtsLearned >= 3, String(afterActivity.stats.distinctMartialArtsLearned));
  check('[rank8] XP increased with real activity (never fabricated)', afterActivity.level.xp > 0, String(afterActivity.level.xp));
  check('[rank9] Rank title is a Korean game-flavored label, distinct from real belt terms', typeof afterActivity.rank.title === 'string' && afterActivity.rank.title.length > 0 && !/단|급|belt/i.test(afterActivity.rank.title), afterActivity.rank.title);

  // ---- Badge conditions ----
  const badges = afterActivity.achievements;
  const tactician = badges.find((b) => b.id === 'tactician');
  const comboMaster = badges.find((b) => b.id === 'combo-master');
  const aiDisciple = badges.find((b) => b.id === 'ai-disciple');
  const explorer = badges.find((b) => b.id === 'technique-explorer');
  check('[badge1] "전략가"(tactician) progress reflects real tactic count (2/5, not unlocked yet)', tactician?.progressCurrent === 2 && tactician?.unlocked === false, JSON.stringify(tactician));
  check('[badge2] "콤보 마스터" progress reflects real combo-training count (3/10)', comboMaster?.progressCurrent === 3 && comboMaster?.unlocked === false, JSON.stringify(comboMaster));
  check('[badge3] "AI 수제자" progress reflects real feedback count (1/5)', aiDisciple?.progressCurrent === 1 && aiDisciple?.unlocked === false, JSON.stringify(aiDisciple));
  check('[badge4] "기술 탐험가" reflects real distinct-martial-art count', explorer?.progressCurrent >= 3, JSON.stringify(explorer));
  check('[badge5] No badge is unlocked without its real condition being met (spec: never fake progress)', badges.every((b) => (b.unlocked ? b.progressCurrent >= b.progressTarget : b.progressCurrent < b.progressTarget)), '');

  // ---- Unlock a badge for real and confirm state flips ----
  await page.evaluate(async () => {
    const { createTactic } = await import('/src/lib/tactic/service.ts');
    for (let i = 0; i < 3; i++) createTactic({ name: 'QA extra ' + i, situation: 's', techniqueIds: ['bjj__armbar'] });
  });
  const afterUnlock = await page.evaluate(async () => {
    const { collectProfileStats } = await import('/src/lib/profileStats/collectProfileStats.ts');
    const { computeAchievementStatuses } = await import('/src/lib/achievements/achievementEngine.ts');
    return computeAchievementStatuses(collectProfileStats());
  });
  const tacticianAfter = afterUnlock.find((b) => b.id === 'tactician');
  check('[badge6] Creating enough tactics actually unlocks "전략가" (5/5)', tacticianAfter?.unlocked === true && !!tacticianAfter.unlockedAt, JSON.stringify(tacticianAfter));

  // ---- Profile page renders rank + new stats + badges ----
  await page.evaluate(() => {
    location.hash = '#/profile';
  });
  await sleep(600);
  const text = await page.evaluate(() => document.body.innerText);
  check('[profile1] Profile page shows the Rank title (not just Level)', text.includes('Level') && /도장 입문자|수련생|수련자|무도인|베테랑|그랜드마스터/.test(text), text.slice(0, 400));
  check('[profile2] Profile page shows new combo/tactic stats', text.includes('내 콤보') && text.includes('내 전술') && text.includes('콤보 훈련 횟수'), '');
  check('[profile3] Profile page shows the new badges in the achievement list', text.includes('전략가') && text.includes('콤보 마스터') && text.includes('AI 수제자') && text.includes('기술 탐험가'), '');
  check('[profile4] Rank/level disclaimer explicitly distinguishes from real belt/competition results', text.includes('게임형 지표') && text.includes('단증'), '');

  check('[regression] No console/page errors across the whole flow', device.consoleErrors.length === 0, JSON.stringify(device.consoleErrors));

  await device.app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
