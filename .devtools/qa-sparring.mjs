import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-sparring-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const INVALID_FILE = path.join(SCRATCH, 'fake.txt');
fs.writeFileSync(INVALID_FILE, 'not a real video file — used to test invalid-file-type rejection');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

function buildSeedSession() {
  const now = Date.now();
  return {
    id: 'seed-session-1',
    date: new Date(now - 2 * 86400000).toISOString(),
    martialArt: 'mma',
    videoName: 'sparring-2026-08-12.mp4',
    videoDurationSec: 103,
    videoResolution: { width: 1280, height: 720 },
    analysisScopes: ['overall', 'posture', 'technique', 'movement', 'attackDefense', 'distance', 'style'],
    overallScores: { technique: null, movement: 72, distance: 62, defense: 74, offense: 81, posture: 76 },
    motionEvents: [
      { timestampSec: 12, category: 'strike_like', label: '타격성 동작 감지', confidence: 'medium' },
      { timestampSec: 37, category: 'level_change_like', label: '레벨 체인지/테이크다운 시도 동작 감지', confidence: 'medium' },
      { timestampSec: 58, category: 'guard_hold_like', label: '가드 유지 동작 감지', confidence: 'low' },
      { timestampSec: 91, category: 'clinch_like', label: '클린치성 근접 동작 감지', confidence: 'low' },
    ],
    techniqueGuesses: [
      { techniqueId: 'wrestling__basic-double-leg', techniqueName: 'Basic Double Leg', martialArt: 'wrestling', occurrences: [37, 91], estimated: true },
      { techniqueId: 'bjj__knee-cut-pass', techniqueName: 'Knee Cut Pass', martialArt: 'bjj', occurrences: [58], estimated: true },
    ],
    postureSegments: [
      { segment: 'early', label: '초반', metrics: [{ id: 'guard', label: 'Guard', score: 82, status: 'good' }], note: null },
      { segment: 'mid', label: '중반', metrics: [{ id: 'stance', label: 'Stance', score: 65, status: 'average' }], note: null },
      { segment: 'late', label: '후반', metrics: [{ id: 'balance', label: 'Balance', score: 48, status: 'needs_improvement' }], note: '영상 후반부에 가드 손 위치가 다소 낮아지는 경향이 관찰되었습니다(참고용 관찰이며, 체력 상태를 확정하지 않습니다).' },
    ],
    styleObservations: [
      '레벨 체인지/테이크다운 시도로 보이는 동작이 여러 차례 관찰되어, 압박형 움직임의 특징이 나타납니다.',
      '클린치성 근접 동작이 자주 관찰되어 근거리 공방을 선호하는 경향이 나타납니다.',
    ],
    styleComparison: null,
    limitations: [{ code: 'single_person_detected', message: '일부 구간에서 한 명만 감지되어 상대와의 상호작용(클린치/거리) 분석이 제한적일 수 있습니다.' }],
    savedMoments: [],
    weakAreas: [
      { label: 'Distance Management', score: 62 },
      { label: 'Balance', score: 48 },
    ],
    notes: null,
  };
}

async function main() {
  let { app, page, consoleErrors } = await launch();

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await new Promise((r) => setTimeout(r, 500));
  }
  async function shot(name) {
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  }
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }
  async function textsOf(sel) {
    return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent?.trim() ?? ''), sel);
  }
  async function clickText(text, selector = 'a, button') {
    return page.evaluate(
      ({ t, s }) => {
        const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t));
        if (!el) return 'NOT_FOUND';
        el.click();
        return 'OK';
      },
      { t: text, s: selector }
    );
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // ============ 1. NAV + EMPTY HUB ============
  // AI 화면은 이제 상단 "AI 코치" 탭의 AI 기능 목록에서 엽니다.
  check('AI 코치 탭 열기 ->', (await clickText('AI 코치', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 500));
  check('AI 코치 탭에 "스파링 영상 AI 분석" 카드', await page.evaluate(() => { const a = document.querySelector('[data-feature="sparring"] a'); if (!a) return false; a.click(); return true; }));
  await new Promise((r) => setTimeout(r, 1500));
  check('Landed on sparring hub', ((await textOf('.section-title h2')) ?? '').includes('스파링 분석'));
  check('Empty state shown with no sessions', ((await textOf('.empty-state')) ?? '').includes('아직 분석한'));
  await shot('01-empty-hub');

  // ============ 2. SPORT SELECT ============
  check('스파링 분석 시작 click ->', (await clickText('스파링 분석 시작', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const sportOptions = await textsOf('.choice-card__title');
  check('All 10 sparring sports listed', sportOptions.filter((t) => t.length > 0).length === 10, JSON.stringify(sportOptions));
  check('MMA option select ->', (await clickText('MMA', 'button')) === 'OK');
  check('다음 (sport) click ->', (await clickText('다음', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));

  // ============ 3. UPLOAD — reject unsupported file type ============
  check('Upload step shows selected sport', (await textOf('.card.info-card p')) === 'MMA');
  await page.setInputFiles('input[type="file"]', INVALID_FILE);
  await new Promise((r) => setTimeout(r, 300));
  const uploadError = await textOf('.ai-inline-warning');
  check('Unsupported file type is rejected with a clear message', (uploadError ?? '').includes('지원하지 않는'), uploadError);
  await shot('02-upload-rejected');

  console.log('\n(실제 스파링 영상 파일이 이 테스트 환경에 없어, 업로드 이후의 실제 MediaPipe 다중 인물 감지 단계는');
  console.log(' 이 자동화 테스트로 직접 구동하지 못합니다 — 대신 아래부터는 실제 분석 결과와 동일한 구조의');
  console.log(' SparringSession을 로컬 저장소에 직접 기록해 결과 화면/연결 기능을 검증합니다.)\n');

  // ============ SEED A REALISTIC RESULT ============
  const seedOk = await page.evaluate((session) => {
    localStorage.setItem('martialdex:sparring-sessions', JSON.stringify([session]));
    return true;
  }, buildSeedSession());
  check('Seeded a realistic SparringSession record', seedOk);
  // A direct localStorage write bypasses sparringSessionRepository's own
  // save()/dispatchEvent() call, so the already-mounted useSparringSessions()
  // hook's state (set once at first mount) wouldn't otherwise know to
  // re-read — a real save via the wizard fires that event itself. Reload to
  // get a fresh mount, same as the earlier stage QA scripts do after seeding.
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate(() => {
    window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
      const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
      if (!isJsonMode) return { ok: true, text: '테스트용 코치 응답입니다.' };
      return { ok: false, code: 'UNKNOWN', message: '테스트에서는 JSON 모드 호출을 사용하지 않습니다.' };
    };
  });

  // ============ 4. HUB SHOWS SEEDED HISTORY ============
  await goto('#/sparring');
  await new Promise((r) => setTimeout(r, 400));
  const historyRowText = (await textsOf('.technique-row')).join(' | ');
  check('Sparring hub lists the seeded session', historyRowText.includes('MMA'), historyRowText);
  await shot('03-hub-with-history');

  check('결과 보기 click ->', (await clickText('결과 보기', 'a')) === 'OK');
  // Widened from 400ms — the result view now mounts several more sections
  // (coaching-synthesis/pattern/sequence-stat cards, useAuth subscription)
  // than when this wait was originally tuned; the extra render work pushed
  // the old window from "usually enough" to "occasionally too tight" in the
  // unminified dev-server build this script runs against.
  await new Promise((r) => setTimeout(r, 900));

  // ============ 5. RESULT SECTIONS RENDER FROM REAL SEEDED DATA ============
  const pageText = await page.evaluate(() => document.body.textContent || '');
  check('Result shows 종목/영상/분석 대상 chips', pageText.includes('MMA') && pageText.includes('분석 대상: 나'));
  const scoreStrongs = await textsOf('.curriculum-stat-row strong');
  check('Overall scores rendered (movement/distance/defense/offense/posture, technique excluded)', scoreStrongs.length === 5, JSON.stringify(scoreStrongs));
  check('Notice that technique execution is never scored', pageText.includes('신뢰할 수 있는 근거가 없어'));

  const techniqueGuessText = (await textsOf('.technique-row__name')).join(' | ');
  check('Technique guesses shown labeled as AI 추정', techniqueGuessText.includes('Basic Double Leg (추정)'), techniqueGuessText);

  const timelineText = (await textsOf('.pose-history-row__main')).join(' | ');
  check('Timeline shows real seeded motion events', timelineText.includes('타격성 동작 감지') && timelineText.includes('클린치성'), timelineText);

  const postureText = await page.evaluate(() => document.body.textContent || '');
  check('Posture segments render early/mid/late labels', postureText.includes('초반') && postureText.includes('중반') && postureText.includes('후반'));
  check('Style observations rendered', postureText.includes('압박형 움직임'));
  check('Weak areas rendered with real labels', postureText.includes('Distance Management') && postureText.includes('Balance'));
  await shot('04-result-view');

  // ============ 6. TECHNIQUE -> SKILL MASTERY CONNECTION (17단계) ============
  check('학습 기록에 추가 click ->', (await clickText('학습 기록에 추가', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  const confirmModalText = await textOf('.modal-panel p');
  check('Confirmation dialog shown before adding to skill record (never auto-confirmed)', (confirmModalText ?? '').includes('추가할까요'), confirmModalText);
  const modalConfirmClicked = await page.evaluate(() => {
    const btn = document.querySelector('.modal-panel .modal-actions .btn-primary');
    if (!btn) return 'NOT_FOUND';
    btn.click();
    return 'OK';
  });
  check('추가 (confirm) click ->', modalConfirmClicked === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const historyEntries = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:training-history') || '[]'));
  check('A trainingHistory entry with source="sparring" was recorded', historyEntries.some((h) => h.source === 'sparring' && h.techniqueIds.includes('wrestling__basic-double-leg')), JSON.stringify(historyEntries));

  // ============ 7. SAVE A SCENE MOMENT (21단계) ============
  check('⭐ 저장 (timeline) click ->', (await clickText('⭐ 저장', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const savedMomentsAfter = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('martialdex:sparring-sessions') || '[]');
    return list[0]?.savedMoments ?? [];
  });
  check('Saved moment persisted on the session record', savedMomentsAfter.length === 1, JSON.stringify(savedMomentsAfter));
  const importantSceneText = await page.evaluate(() => document.body.textContent || '');
  check('"⭐ 중요 장면" section now shows the saved moment', importantSceneText.includes('⭐ 중요 장면'));

  // ============ 8. WEAK AREA -> TODAY'S TRAINING (16단계) ============
  check('오늘의 훈련에 추가 click ->', (await clickText('오늘의 훈련에 추가', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const todaySessionAfterAdd = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session') || 'null'));
  check('Today-training session created/updated with a real technique id from the weak area', !!todaySessionAfterAdd && todaySessionAfterAdd.plan.techniqueIds.length > 0, JSON.stringify(todaySessionAfterAdd?.plan?.techniqueIds));

  // ============ 9. AI 개인 코치 CONTEXT CONNECTION (16단계) ============
  let capturedContext = null;
  await page.evaluate(() => {
    window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
      window.__lastRequest = request;
      return { ok: true, text: '테스트 응답' };
    };
  });
  await goto('#/coach');
  await new Promise((r) => setTimeout(r, 300));
  check('✦ AI에게 직접 물어보기 (coach) click ->', (await clickText('✦ AI에게 직접 물어보기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('오늘 뭐 연습할까? example click ->', (await clickText('오늘 뭐 연습할까?', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 900));
  capturedContext = await page.evaluate(() => window.__lastRequest?.contextText ?? null);
  check('AI 개인 코치 context includes the sparring session summary', !!capturedContext && capturedContext.includes('최근 스파링 분석'), capturedContext?.slice(0, 200));
  await clickText('닫기');

  // ============ 10. WEAK AREAS -> IMPROVEMENT CURRICULUM (22단계, 신규 2단계 UX) ============
  // Upgraded from a single-click generator to a configurable options sheet
  // (기간/주당 횟수/세션시간/집중 약점) that still generates immediately with
  // defaults — reuses the real aiCurriculum matching pipeline now, so this
  // also exercises matchGoalToTechniques/discoverMissingDesiredTechniques/
  // planGoalCurriculum for real (deterministic; a real Gemini call only
  // happens if a detected technique name somehow isn't already resolved by
  // search, which is the uncommon path).
  await goto(`#/sparring/seed-session-1`);
  await new Promise((r) => setTimeout(r, 900));
  check('🎯 맞춤 커리큘럼 생성 click -> (opens options sheet)', (await clickText('🎯 맞춤 커리큘럼 생성', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 500));
  check('커리큘럼 생성하기 click -> (defaults)', (await clickText('커리큘럼 생성하기', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 3000));
  const curriculumTitle = await textOf('.detail-hero h1');
  check('Navigated to a newly created sparring-improvement curriculum', (curriculumTitle ?? '').includes('스파링 분석 개선'), curriculumTitle);
  const curriculumDayCount = await page.evaluate(() => document.querySelectorAll('.day-card').length);
  check('Curriculum has real content Days', curriculumDayCount > 0, `days=${curriculumDayCount}`);
  await shot('05-weakness-curriculum');

  // ============ 11. SESSION DETAIL — VIDEO RE-ATTACH PROMPT ============
  await goto('#/sparring/seed-session-1');
  await new Promise((r) => setTimeout(r, 400));
  const reattachPrompt = await textOf('.card.info-card h3');
  check('Session detail offers to re-attach the video for scene playback', (reattachPrompt ?? '').includes('영상 다시 불러오기'));
  check('Video file itself was never persisted (only structured analysis data)', await page.evaluate(() => !localStorage.getItem('martialdex:sparring-sessions').includes('blob:') && !localStorage.getItem('martialdex:sparring-sessions').includes('base64')));

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 12. RESTART -> PERSISTENCE ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  await goto('#/sparring');
  await new Promise((r) => setTimeout(r, 500));
  const historyAfterRestart = (await textsOf('.technique-row')).join(' | ');
  check('Sparring session persists after app restart', historyAfterRestart.includes('MMA'), historyAfterRestart);
  const trainingHistoryAfterRestart = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:training-history') || '[]'));
  check('Sparring-sourced training-history entry persists after restart', trainingHistoryAfterRestart.some((h) => h.source === 'sparring'));
  await shot('06-after-restart');

  // ============ REGRESSION ============
  await goto('#/');
  check('[Regression] Home shows 10 martial arts', (await page.evaluate(() => document.querySelectorAll('.art-card').length)) === 10);
  check('[Regression] Home still shows 오늘의 훈련/AI 개인 코치 cards', await page.evaluate(() => [...document.querySelectorAll('h2')].some((h) => h.textContent?.includes('오늘의 훈련'))));
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('Armbar', { delay: 15 });
  await new Promise((r) => setTimeout(r, 350));
  check('[Regression] Search still works', (await page.evaluate(() => document.querySelectorAll('.search-result-row').length)) > 0);
  await page.keyboard.press('Escape');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  check('[Regression] Technique detail still works', (await textOf('.detail-hero h1')) === 'Armbar');
  check('[Regression] YouTube embed still works', (await page.evaluate(() => document.querySelectorAll('.video-embed iframe').length)) > 0);

  await goto('#/arts/bjj/techniques');
  const filterResult = await page.evaluate(() => {
    const sel = document.querySelector('select.select');
    if (!sel || sel.options.length < 2) return 'NO_OPTIONS';
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  });
  check('[Regression] Filter still works', filterResult === 'OK');

  await goto('#/learning/bjj');
  check('[Regression] Official curriculum overview still works', ((await textOf('.curriculum-hero h3')) ?? '').includes('주짓수'));

  await goto('#/fighter-style');
  check('[Regression] Fighter-style hub still works', ((await textOf('.section-title h2')) ?? '') === '선수 스타일 학습');

  await goto('#/coach');
  check('[Regression] AI Coach page still works', ((await textOf('.section-title h2')) ?? '').includes('AI 코치'));

  await goto('#/my-skills');
  const overallStats = await textsOf('.curriculum-stat-row strong');
  check('[Regression] My Skills dashboard still works', Number(overallStats[0]) > 1000, overallStats[0]);

  await goto('#/arts/boxing/techniques/boxing__jab');
  check('[Regression] Pose-analysis button still present on supported technique', await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기'))));

  console.log('\n=== CONSOLE ERRORS TOTAL (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(path.join(SCRATCH, 'qa-sparring-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
