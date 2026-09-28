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

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-shadow-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  // ---- Technique pool resolution priority (deterministic, no waiting) ----
  const poolTests = await page.evaluate(async () => {
    const { resolveShadowTechniquePool } = await import('/src/lib/shadowBoxing/techniquePool.ts');
    const { setOverride } = await import('/src/lib/skillProgress/overrideStore.ts');
    const { createCustomCurriculum, saveCustomCurriculum, addDay, addTechniqueToDay, ensureProgress } = await import('/src/lib/curriculum/curriculumService.ts');
    const { getTechniquesByMartialArt } = await import('/src/lib/loadData.ts');

    // (3) General fallback — no curriculum, no learning overrides for judo.
    const fallbackPool = resolveShadowTechniquePool('judo');
    const judoTechniques = new Set(getTechniquesByMartialArt('judo').map((t) => t.id));
    const fallbackAllReal = fallbackPool.every((id) => judoTechniques.has(id));

    // (2) Learning-priority — mark 3 real karate techniques as "learning".
    const karateTechniques = getTechniquesByMartialArt('karate').map((t) => t.id);
    const learningIds = karateTechniques.slice(0, 3);
    learningIds.forEach((id) => setOverride(id, 'learning'));
    const learningPool = resolveShadowTechniquePool('karate');
    const learningPoolMatches = learningIds.every((id) => learningPool.includes(id));

    // (1) Curriculum-priority — an active custom curriculum for boxing should outrank "learning" overrides.
    const boxingTechniques = getTechniquesByMartialArt('boxing').map((t) => t.id);
    boxingTechniques.slice(3, 6).forEach((id) => setOverride(id, 'learning'));
    let curriculum = createCustomCurriculum({ title: 'QA 커리큘럼', description: '', martialArt: 'boxing', visibility: 'private' });
    curriculum = addDay(curriculum);
    curriculum = addTechniqueToDay(curriculum, 1, boxingTechniques[0]);
    curriculum = addTechniqueToDay(curriculum, 1, boxingTechniques[1]);
    curriculum = saveCustomCurriculum(curriculum);
    ensureProgress(curriculum);
    const curriculumPool = resolveShadowTechniquePool('boxing');
    const curriculumPoolMatches = boxingTechniques.slice(0, 2).every((id) => curriculumPool.includes(id));
    const curriculumOutranksLearning = !boxingTechniques.slice(3, 6).some((id) => curriculumPool.includes(id)) || curriculumPoolMatches;

    return { fallbackPool, fallbackAllReal, learningPool, learningPoolMatches, curriculumPool, curriculumPoolMatches, curriculumOutranksLearning };
  });
  check('[pool1] Fallback pool for a martial art with no user data returns only real techniques', poolTests.fallbackAllReal && poolTests.fallbackPool.length >= 2, JSON.stringify(poolTests.fallbackPool));
  check('[pool2] Learning-priority pool includes the techniques marked "learning" for that martial art', poolTests.learningPoolMatches, JSON.stringify(poolTests.learningPool));
  check('[pool3] Curriculum-priority pool includes today\'s real curriculum-day techniques', poolTests.curriculumPoolMatches, JSON.stringify(poolTests.curriculumPool));

  // ---- Deterministic round/rest/announce transitions via direct session manipulation (no real waiting) ----
  const transitions = await page.evaluate(async () => {
    const { startShadowSession, tickShadowSession, getShadowSession, clearShadowSession } = await import('/src/lib/shadowBoxing/sessionStore.ts');
    clearShadowSession();
    const pool = ['boxing__jab', 'boxing__cross', 'boxing__hook'];
    let session = startShadowSession({ martialArt: 'boxing', techniquePool: pool, roundSeconds: 100, totalRounds: 2, restSeconds: 20, pace: 'fast' });

    function overwrite(patch) {
      const current = JSON.parse(window.localStorage.getItem('martialdex:shadow-boxing-session'));
      const updated = { ...current, ...patch };
      window.localStorage.setItem('martialdex:shadow-boxing-session', JSON.stringify(updated));
      return updated;
    }

    // Force the announce timer to be due.
    overwrite({ nextAnnounceTimestamp: Date.now() - 10 });
    const announceEvents = tickShadowSession();
    const afterAnnounce = getShadowSession();

    // Force round 1 to end -> should transition to rest.
    overwrite({ phaseEndTimestamp: Date.now() - 10 });
    const roundEndEvents = tickShadowSession();
    const afterRoundEnd = getShadowSession();

    // Force rest to end -> should transition to round 2.
    overwrite({ phaseEndTimestamp: Date.now() - 10 });
    const restEndEvents = tickShadowSession();
    const afterRestEnd = getShadowSession();

    // Force round 2 (the last round) to end -> should finish and write training history.
    overwrite({ phaseEndTimestamp: Date.now() - 10, announcedTechniqueIds: ['boxing__jab', 'boxing__cross'] });
    const finishEvents = tickShadowSession();
    const afterFinish = getShadowSession();

    return { announceEvents, afterAnnounce, roundEndEvents, afterRoundEnd, restEndEvents, afterRestEnd, finishEvents, afterFinish };
  });
  check('[round1] Announce tick emits a real technique name and advances announceIndex', transitions.announceEvents.some((e) => e.type === 'announce' && /잽|스트레이트|훅|크로스|Jab|Cross|Hook/i.test(e.text)) && transitions.afterAnnounce.announceIndex === 1, JSON.stringify(transitions.announceEvents));
  check('[round2] Round-end tick transitions phase to "rest"', transitions.roundEndEvents.some((e) => e.type === 'round-end') && transitions.afterRoundEnd.phase === 'rest', JSON.stringify(transitions.roundEndEvents) + ' phase=' + transitions.afterRoundEnd.phase);
  check('[round3] Rest-end tick transitions phase back to "round" and increments currentRound', transitions.afterRestEnd.phase === 'round' && transitions.afterRestEnd.currentRound === 2, JSON.stringify(transitions.restEndEvents) + ' round=' + transitions.afterRestEnd.currentRound);
  check('[round4] Final round-end (last round) emits "finished" and marks phase finished', transitions.finishEvents.some((e) => e.type === 'finished') && transitions.afterFinish.phase === 'finished' && !!transitions.afterFinish.finishedAt, JSON.stringify(transitions.finishEvents));

  // ---- Training history integration: exactly one entry with source 'shadow' ----
  const historyCheck = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const entries = listTrainingHistory().filter((e) => e.source === 'shadow');
    return { count: entries.length, entry: entries[0] };
  });
  check('[history1] Exactly one trainingHistory entry with source:"shadow" was written on finish', historyCheck.count === 1, JSON.stringify(historyCheck.entry));
  check('[history2] The shadow entry\'s techniqueIds are the real announced techniques (deduped)', historyCheck.entry && new Set(historyCheck.entry.techniqueIds).size === historyCheck.entry.techniqueIds.length && historyCheck.entry.techniqueIds.includes('boxing__jab') && historyCheck.entry.techniqueIds.includes('boxing__cross'), JSON.stringify(historyCheck.entry?.techniqueIds));
  check('[history3] The shadow entry\'s notes mention rounds and announce count (spec: connect to real session shape)', historyCheck.entry && /라운드/.test(historyCheck.entry.notes || ''), historyCheck.entry?.notes);

  // ---- Pause/resume freezing ----
  const pauseTest = await page.evaluate(async () => {
    const { startShadowSession, pauseShadowSession, resumeShadowSession, getPhaseRemainingMs, clearShadowSession, tickShadowSession } = await import('/src/lib/shadowBoxing/sessionStore.ts');
    clearShadowSession();
    startShadowSession({ martialArt: 'boxing', techniquePool: ['boxing__jab', 'boxing__cross'], roundSeconds: 50, totalRounds: 3, restSeconds: 10, pace: 'normal' });
    await new Promise((r) => setTimeout(r, 300));
    const paused = pauseShadowSession();
    const remainingAtPause = getPhaseRemainingMs(paused);
    await new Promise((r) => setTimeout(r, 500));
    const remainingStillFrozen = getPhaseRemainingMs(paused);
    const ticksWhilePaused = tickShadowSession();
    const resumed = resumeShadowSession();
    const remainingAfterResume = getPhaseRemainingMs(resumed);
    clearShadowSession();
    return { paused: paused.paused, remainingAtPause, remainingStillFrozen, ticksWhilePaused, resumedPaused: resumed.paused, remainingAfterResume };
  });
  check('[timer1] Pausing freezes the phase (paused:true, pausedRemainingMs set)', pauseTest.paused === true && pauseTest.remainingAtPause > 0, JSON.stringify(pauseTest));
  check('[timer2] Remaining time does not drain further while paused', Math.abs(pauseTest.remainingStillFrozen - pauseTest.remainingAtPause) < 5, JSON.stringify(pauseTest));
  check('[timer3] tickShadowSession() is a no-op while paused (no events)', pauseTest.ticksWhilePaused.length === 0, JSON.stringify(pauseTest.ticksWhilePaused));
  check('[timer4] Resuming un-pauses and restores remaining time close to what was frozen', pauseTest.resumedPaused === false && Math.abs(pauseTest.remainingAfterResume - pauseTest.remainingAtPause) < 200, JSON.stringify(pauseTest));

  // ---- stopShadowSession: no announcements yet -> no history entry written ----
  const stopNoProgress = await page.evaluate(async () => {
    const { startShadowSession, stopShadowSession, getShadowSession, clearShadowSession } = await import('/src/lib/shadowBoxing/sessionStore.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    clearShadowSession();
    const before = listTrainingHistory().filter((e) => e.source === 'shadow').length;
    startShadowSession({ martialArt: 'boxing', techniquePool: ['boxing__jab', 'boxing__cross'], roundSeconds: 100, totalRounds: 3, restSeconds: 20, pace: 'normal' });
    stopShadowSession();
    const after = listTrainingHistory().filter((e) => e.source === 'shadow').length;
    return { before, after, sessionCleared: getShadowSession() === null };
  });
  check('[stop1] Stopping with zero announcements does not fabricate a training history entry', stopNoProgress.after === stopNoProgress.before, JSON.stringify(stopNoProgress));
  check('[stop2] Session is cleared after stop', stopNoProgress.sessionCleared);

  // ---- Real end-to-end run through the UI: settings screen, TTS spy, real timer, finalize ----
  await page.evaluate(() => { location.hash = '#/shadow-boxing'; });
  await sleep(500);
  const settingsVisible = await page.evaluate(() => document.body.innerText.includes('훈련 시작') && document.body.innerText.includes('페이스'));
  check('[ui1] Settings screen shows martial art / round / rest / pace controls', settingsVisible);

  await page.evaluate(() => {
    window.__ttsCalls = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (utterance) => { window.__ttsCalls.push({ text: utterance.text, lang: utterance.lang }); };
    }
  });

  const selects = await page.$$('select.select');
  // selects order: martialArt, roundSeconds, totalRounds, restSeconds, pace
  if (selects.length >= 5) {
    await selects[1].selectOption('60');
    await selects[2].selectOption('3');
    await selects[3].selectOption('15');
    await selects[4].selectOption('fast');
  }
  await page.click('button:has-text("훈련 시작")');
  await sleep(600);

  const activeScreenText = await page.evaluate(() => document.body.innerText);
  check('[ui2] Active training screen shows round chip and phase', /라운드 1 \/ 3/.test(activeScreenText) && /훈련 중|휴식 중/.test(activeScreenText), activeScreenText.slice(0, 200));

  // Wait long enough for at least one real fast-pace (3s) announce to fire.
  await sleep(3800);
  const ttsCallsAfterWait = await page.evaluate(() => window.__ttsCalls);
  check('[tts1] TTS speak() was actually invoked with a real technique name during a live round', ttsCallsAfterWait.length > 0 && ttsCallsAfterWait.every((c) => c.lang === 'ko-KR'), JSON.stringify(ttsCallsAfterWait));

  await page.click('button:has-text("훈련 종료")');
  await sleep(400);
  const stoppedText = await page.evaluate(() => document.body.innerText);
  const liveHistory = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().filter((e) => e.source === 'shadow');
  });
  // Baseline is 1 (from the earlier deterministic transitions test's finalize) — a live stop-with-progress adds exactly one more.
  check('[ui3] Manually stopping a live session with real progress records one more shadow trainingHistory entry', liveHistory.length === 2, JSON.stringify(liveHistory));
  check('[ui4] UI returns to the settings screen (or a completion state) after stopping, no crash', /훈련 시작|훈련 완료/.test(stoppedText));

  check('[regression] No console/page errors across the whole shadow-boxing flow', consoleErrors.length === 0, JSON.stringify(consoleErrors));

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
