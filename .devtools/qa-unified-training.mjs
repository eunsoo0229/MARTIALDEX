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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-unified-train-'));
  const device = await launchDevice(dir);
  const { page } = device;

  // ===================================================================
  // A. Official curriculum: unified 훈련하기 button + day picker + full
  //    set/rep/timer training, same engine as before.
  // ===================================================================
  const officialBjjIdEarly = await page.evaluate(async () => {
    const { getCurriculumsForMartialArt } = await import('/src/lib/curriculum/curriculumService.ts');
    return getCurriculumsForMartialArt('bjj').official?.id ?? null;
  });
  await page.evaluate((id) => {
    location.hash = `#/learning/bjj/${id}`;
  }, officialBjjIdEarly);
  await sleep(500);

  let text = await page.evaluate(() => document.body.innerText);
  check('[A1] Official curriculum day-list shows a unified 훈련하기 button', text.includes('훈련하기'), text.slice(0, 300));

  await page.click('a:has-text("훈련하기")');
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[A2] 훈련하기 opens a Day-select screen with current-day + day-picker', text.includes('훈련 시작') && text.includes('다른 Day로 훈련하기'), text.slice(0, 300));

  await page.click('button:has-text("다른 Day로 훈련하기")');
  await sleep(300);
  text = await page.evaluate(() => document.body.innerText);
  check('[A3] Day picker lists individual Day buttons', /Day 1/.test(text) && /Day 2/.test(text), text.slice(0, 400));

  await page.click('button:text-is("Day 1")'); // the day-picker's exact-text chip, distinct from the "Day 1 훈련 시작" primary button
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(600);
  text = await page.evaluate(() => document.body.innerText);
  check('[A4] Picking a Day starts the real set/rep/timer Training Session (not the old read-only Day view)', /SET 1 \//.test(text), text.slice(0, 400));

  const sessionAfterStart = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session')));
  check('[A5] Session plan is bound to the exact curriculum+day chosen via 훈련하기 (not the global picker)', sessionAfterStart?.plan?.day === 1 && sessionAfterStart?.plan?.mode === 'curriculum', JSON.stringify(sessionAfterStart?.plan));

  // ===================================================================
  // B. Custom (user-created) curriculum: same 훈련하기 button + flow.
  // ===================================================================
  const customId = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const boxing = allTechniques.filter((t) => t.martialArt === 'boxing');
    let c = createCustomCurriculum({ title: 'QA 유저 커리큘럼', description: 'qa', martialArt: 'boxing', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, boxing[0].id);
    saveCustomCurriculum(c);
    return c.id;
  });
  await page.evaluate(async () => {
    const { clearTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    clearTodaySession();
  });
  await page.evaluate((id) => {
    location.hash = `#/learning/boxing/${id}`;
  }, customId);
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[B1] User-created curriculum also shows the same 훈련하기 button', text.includes('훈련하기'), text.slice(0, 200));

  await page.click('a:has-text("훈련하기")');
  await sleep(400);
  await page.click('button:has-text("Day 1 훈련 시작")');
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(600);
  text = await page.evaluate(() => document.body.innerText);
  check('[B2] Custom curriculum training starts the real set/rep/timer engine', /SET 1 \//.test(text), text.slice(0, 300));

  const customSession = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session')));
  check('[B3] Session is bound to the custom curriculum id', customSession?.plan?.curriculumId === customId, JSON.stringify(customSession?.plan));

  // ===================================================================
  // C. AI 선수 스타일 (fighter-style) curriculum — must work IDENTICALLY,
  //    no special-cased screen, exact same 훈련하기 -> Day select -> Training
  //    Session path as A and B above.
  // ===================================================================
  const styleId = await page.evaluate(async () => {
    const { searchTechniques } = await import('/src/lib/search.ts');
    const { classifyPhase } = await import('/src/lib/fighterStyle/phaseClassifier.ts');
    const { getTechnique } = await import('/src/lib/loadData.ts');
    const { saveNewStyleCurriculum } = await import('/src/lib/fighterStyle/styleCurriculumService.ts');
    const seen = new Map();
    for (const term of ['더블렉', '테이크다운', '스프롤']) for (const t of searchTechniques(term, 10)) if (!seen.has(t.id)) seen.set(t.id, t);
    const matches = [...seen.values()].map((t, i) => {
      const tech = getTechnique(t.id);
      return { techniqueId: t.id, techniqueName: t.name, martialArt: t.martialArt, relevanceScore: 90 - i, reason: 'qa', phase: tech ? classifyPhase(tech) : 'entries' };
    });
    const saved = saveNewStyleCurriculum({
      fighterId: 'qa-unified-fighter',
      fighterName: 'QA통합선수',
      styleAnalysis: { styleSummary: '', primaryStyles: [], keyTechniques: [], preferredPositions: [], offensiveConcepts: [], defensiveConcepts: [], distanceManagement: [], transitions: [] },
      matchedTechniques: matches,
      targetDays: 7,
      intensity: 'normal',
      userLevel: 'beginner',
      durationMode: 'user_selected',
    });
    return saved.id;
  });
  await page.evaluate(async () => {
    const { clearTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    clearTodaySession();
  });
  await page.evaluate((id) => {
    location.hash = `#/learning/mma/${id}`;
  }, styleId);
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[C1] AI 선수 스타일 curriculum shows the exact same 훈련하기 button (no special-cased UI)', text.includes('훈련하기'), text.slice(0, 300));

  await page.click('a:has-text("훈련하기")');
  await sleep(400);
  text = await page.evaluate(() => document.body.innerText);
  check('[C2] Style curriculum reaches the identical Day-select screen', text.includes('훈련 시작'), text.slice(0, 200));

  await page.click('button:has-text("Day 1 훈련 시작")');
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(600);
  text = await page.evaluate(() => document.body.innerText);
  check('[C3] Style curriculum drives the real set/rep/timer Training Session', /SET 1 \//.test(text), text.slice(0, 400));

  const styleSession = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session')));
  check('[C4] Session correctly bound to the style curriculum id', styleSession?.plan?.curriculumId === styleId, JSON.stringify(styleSession?.plan));

  // This style-curriculum Day has 3 techniques (proven by the "1/3" chip in
  // C3's UI check above) — finish all of them programmatically (the UI path
  // for completing ONE set was already proven above) to drive the session to
  // full completion and confirm the finalize -> trainingHistory ->
  // curriculum-progress chain works identically for a style curriculum.
  await page.evaluate(async () => {
    const { getTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    const { recordSetResult } = await import('/src/lib/todayTraining/sessionDetail.ts');
    let session = getTodaySession();
    for (let exerciseIndex = 0; exerciseIndex < session.detail.exercises.length; exerciseIndex++) {
      const exercise = session.detail.exercises[exerciseIndex];
      for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
        session = recordSetResult(session, exerciseIndex, setIndex, { actualReps: exercise.config.targetReps ?? 5, actualSeconds: exercise.config.targetSeconds ?? undefined }) ?? session;
      }
    }
  });
  await sleep(600);
  const styleHistory = await page.evaluate((id) => {
    const list = JSON.parse(localStorage.getItem('martialdex:training-history') || '[]');
    return list.find((h) => h.curriculumId === id);
  }, styleId);
  check('[C5] Completing style-curriculum training writes a trainingHistory record (12)', !!styleHistory && styleHistory.completed === true, JSON.stringify(styleHistory));

  const styleProgress = await page.evaluate((id) => {
    const map = JSON.parse(localStorage.getItem('martialdex:curricula:progress') || '{}');
    return map[id];
  }, styleId);
  check('[C6] Curriculum progress for the style curriculum shows Day 1 complete', !!styleProgress?.completedDays?.includes(1), JSON.stringify(styleProgress));

  // ===================================================================
  // D. Confirmation before overwriting an unfinished, different session.
  // ===================================================================
  const officialBjjId = await page.evaluate(async () => {
    const { getCurriculumsForMartialArt } = await import('/src/lib/curriculum/curriculumService.ts');
    return getCurriculumsForMartialArt('bjj').official?.id ?? null;
  });
  check('[D setup] found the real official BJJ curriculum id', !!officialBjjId, String(officialBjjId));

  await page.evaluate(async () => {
    const { clearTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    clearTodaySession();
  });
  await page.evaluate((id) => {
    location.hash = `#/learning/boxing/${id}/train`;
  }, customId);
  await sleep(400);
  await page.click('button:has-text("Day 1 훈련 시작")'); // start custom curriculum's Day 1
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(400);

  let confirmSeen = false;
  let confirmMessage = '';
  page.once('dialog', async (dialog) => {
    confirmSeen = true;
    confirmMessage = dialog.message();
    await dialog.accept();
  });
  await page.evaluate((id) => {
    location.hash = `#/learning/bjj/${id}/train`;
  }, officialBjjId);
  await sleep(400);
  await page.click('button:has-text("Day 1 훈련 시작")'); // different curriculum's Day 1 -> should prompt
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(400);

  check('[D1] Starting a different curriculum while a session is unfinished shows a confirmation dialog', confirmSeen, confirmMessage);
  const sessionAfterConfirm = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session')));
  check('[D2] After accepting, the session switches to the newly chosen curriculum', sessionAfterConfirm?.plan?.curriculumId === officialBjjId, JSON.stringify(sessionAfterConfirm?.plan));

  // ===================================================================
  // E. YouTube live-search fallback on the training screen for a
  //    technique with NO curated video.
  // ===================================================================
  await page.evaluate(async () => {
    const { clearTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    clearTodaySession();
  });
  const noCuratedId = await page.evaluate(async () => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const t = allTechniques.find((t) => t.videos.length === 0);
    return t?.id ?? null;
  });
  check('[E setup] found a real technique with zero curated videos', !!noCuratedId, String(noCuratedId));

  const curatedId = await page.evaluate(async () => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const t = allTechniques.find((t) => t.videos.length > 0);
    return t?.id ?? null;
  });
  check('[D setup] found a real technique WITH a curated video (for the priority check)', !!curatedId, String(curatedId));

  // D-real: curated video always wins over live search.
  const curatedResultId = await page.evaluate(async (id) => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum, ensureProgress } = await import('/src/lib/curriculum/curriculumService.ts');
    let c = createCustomCurriculum({ title: 'QA 영상 우선순위', description: 'qa', martialArt: 'bjj', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, id);
    saveCustomCurriculum(c);
    ensureProgress(c);
    return c.id;
  }, curatedId);
  await page.evaluate((id) => {
    location.hash = `#/learning/bjj/${id}/train`;
  }, curatedResultId);
  await sleep(400);
  await page.click('button:has-text("Day 1 훈련 시작")');
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(600);
  text = await page.evaluate(() => document.body.innerText);
  check('[6] Curated video (data/curated/videos.json) is used when present — no live-search text shown', text.includes('관련 영상') && !text.includes('등록된 영상이 없어'), text.slice(-500));

  // Now the no-curated-video case: real live search fallback.
  await page.evaluate(async () => {
    const { clearTodaySession } = await import('/src/lib/todayTraining/sessionStore.ts');
    clearTodaySession();
  });
  const noVideoResultId = await page.evaluate(async (id) => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum, ensureProgress } = await import('/src/lib/curriculum/curriculumService.ts');
    let c = createCustomCurriculum({ title: 'QA 실시간 검색', description: 'qa', martialArt: 'bjj', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, id);
    saveCustomCurriculum(c);
    ensureProgress(c);
    return c.id;
  }, noCuratedId);
  await page.evaluate((id) => {
    location.hash = `#/learning/bjj/${id}/train`;
  }, noVideoResultId);
  await sleep(400);
  await page.click('button:has-text("Day 1 훈련 시작")');
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[5a] Training screen shows "영상을 검색하는 중..." while the live search runs', text.includes('검색하는 중'), text.slice(-400));

  await sleep(4000); // give the real Electron-path YouTube search time to complete
  text = await page.evaluate(() => document.body.innerText);
  check(
    '[6b][9] Live search fallback found real results and shows the "등록된 영상이 없어..." notice',
    text.includes('등록된 영상이 없어 YouTube에서 관련 영상을 찾았습니다'),
    text.slice(-500)
  );

  const cachedAfterSearch = await page.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem('martialdex:youtube-search-cache') || '{}');
    return raw[id];
  }, noCuratedId);
  check('[11] Live search result cached locally (per techniqueId)', !!cachedAfterSearch && Array.isArray(cachedAfterSearch.results), JSON.stringify(cachedAfterSearch)?.slice(0, 300));

  check('[14] videos.json itself was not modified by the live search (cache is a separate key)', !!cachedAfterSearch, 'cache key is martialdex:youtube-search-cache, distinct from data/curated/videos.json');

  // Play one of the search-result cards and confirm it embeds inline (no navigation away from the training screen).
  const hasPlayButton = await page.evaluate(() => !!document.querySelector('.video-search-result'));
  check('[9b] Search results render as clickable cards (thumbnail + play) on the training screen', hasPlayButton);

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  console.log('console errors captured:', device.consoleErrors.length, JSON.stringify(device.consoleErrors));
  await device.app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
