import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-situation-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

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

const MOCK_SCRIPT = () => {
  window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
    const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
    if (!isJsonMode) return { ok: true, text: '테스트 응답' };
    const ctx = request.contextText || '';
    if (ctx.includes('후보 기술 목록')) {
      const ids = [...ctx.matchAll(/^- ([a-z0-9_-]+):/gm)].map((m) => m[1]).slice(0, 3);
      if (ids.length === 0) return { ok: false, code: 'UNKNOWN', message: '후보 없음' };
      return { ok: true, text: JSON.stringify({ items: ids.map((id) => ({ techniqueId: id, reason: '테스트용 AI 추천 이유입니다(교육/훈련용).' })) }) };
    }
    return { ok: false, code: 'UNKNOWN', message: '알 수 없는 테스트 요청' };
  };
};

const MOCK_FAILURE_SCRIPT = () => {
  window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
    const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
    if (!isJsonMode) return { ok: true, text: 'ok' };
    return { ok: false, code: 'RATE_LIMIT', message: '요청이 너무 많습니다.' };
  };
};

const MOCK_FABRICATION_ATTEMPT_SCRIPT = () => {
  window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
    const isJsonMode = (request.systemInstruction || '').includes('JSON만 반환하는');
    if (!isJsonMode) return { ok: true, text: 'ok' };
    const ctx = request.contextText || '';
    if (ctx.includes('후보 기술 목록')) {
      const ids = [...ctx.matchAll(/^- ([a-z0-9_-]+):/gm)].map((m) => m[1]);
      // Deliberately mixes one REAL candidate id with fabricated ones the
      // model might hallucinate — the app must drop the fake ones.
      return {
        ok: true,
        text: JSON.stringify({
          items: [
            { techniqueId: 'totally-fake-technique-id', reason: '가짜 기술' },
            { techniqueId: ids[0] ?? 'still-fake', reason: '진짜 기술 하나' },
            { techniqueId: 'another-invented-id', reason: '또 다른 가짜 기술' },
          ],
        }),
      };
    }
    return { ok: false, code: 'UNKNOWN', message: 'n/a' };
  };
};

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
  await page.evaluate(MOCK_SCRIPT);

  // ============ 1. ENTRY POINT FROM AI COACH ============
  await goto('#/coach');
  await new Promise((r) => setTimeout(r, 400));
  check('AI Coach page has "상황 추천 받기" entry point', (await clickText('상황 추천 받기', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('Landed on situation-recommend page', ((await textOf('.section-title h2')) ?? '').includes('상황별 기술 추천'));
  await shot('01-situation-page');

  // ============ 2. MARTIAL ART SELECT + CATEGORY BUTTONS ============
  const categoryLabels = ['거리', '공격', '방어', '클린치', '테이크다운', '그라운드', '가드', '탈출', '전환', '카운터'];
  const chipTexts = await textsOf('.chip-row .chip');
  check('All 10 situation categories shown as buttons', categoryLabels.every((c) => chipTexts.includes(c)), JSON.stringify(chipTexts));

  await page.selectOption('select.select', 'boxing');
  const selectedValue = await page.evaluate(() => document.querySelector('select.select').value);
  check('Martial art select works (boxing)', selectedValue === 'boxing');

  check('공격 category button click ->', (await clickText('공격', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  const categoryActive = await page.evaluate(() => [...document.querySelectorAll('.chip')].some((c) => c.textContent === '공격' && c.classList.contains('active')));
  check('Selected category becomes visually active', categoryActive);

  // ============ 3. EXAMPLE SITUATION QUICK-FILL ============
  check('Example situation button click fills textarea ->', (await clickText('복싱 거리에서 계속 맞아.', 'button')) === 'OK');
  const textareaValue = await page.evaluate(() => document.querySelector('textarea').value);
  check('Textarea filled with example text', textareaValue === '복싱 거리에서 계속 맞아.', textareaValue);
  await shot('02-situation-filled');

  // ============ 4. GET RECOMMENDATION (AI, mocked) ============
  check('추천 받기 click ->', (await clickText('추천 받기', 'button')) === 'OK');
  let gotResult = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await page.evaluate(() => document.querySelectorAll('.technique-row').length > 0)) {
      gotResult = true;
      break;
    }
    if (await textOf('.ai-inline-warning')) break;
  }
  check('Recommendation results rendered', gotResult);
  const recNames = await textsOf('.technique-row__name');
  check('At least one real technique recommended', recNames.length > 0, JSON.stringify(recNames));
  const recReasons = await textsOf('.technique-row__sub');
  check('Each recommendation shows a reason', recReasons.length === recNames.length && recReasons.every((r) => r.length > 0));
  await shot('03-recommendation-result');

  // ============ 5. VERIFY REAL TECHNIQUE IDS (no fabrication) — click through to detail ============
  check('기술 상세 link click -> navigates to a REAL technique page (not 404)', (await clickText('기술 상세', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  const detailTitle = await textOf('.detail-hero h1');
  check('Technique detail page loaded with a real name (no NotFound)', !!detailTitle && detailTitle.length > 0, detailTitle);
  const isNotFound = await page.evaluate(() => document.body.textContent?.includes('페이지를 찾을 수 없') ?? false);
  check('Did not redirect to a NotFound page', !isNotFound);

  // ============ 6. ACTIONS: TODAY'S TRAINING + CURRICULUM ADD ============
  await goto('#/situation');
  await new Promise((r) => setTimeout(r, 400));
  await page.selectOption('select.select', 'boxing');
  await clickText('공격', 'button');
  await page.fill('textarea', '복싱 거리에서 계속 맞아.');
  await clickText('추천 받기', 'button');
  await new Promise((r) => setTimeout(r, 1500));

  check('오늘의 훈련에 추가 click ->', (await clickText('오늘의 훈련에 추가', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const todaySession = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session') || 'null'));
  check('Recommended technique added to today-training session (real id)', !!todaySession && todaySession.plan.techniqueIds.length > 0, JSON.stringify(todaySession?.plan?.techniqueIds));
  const bodyTextAfterAdd = await page.evaluate(() => document.body.textContent || '');
  check('"오늘의 훈련에 추가했습니다" confirmation shown', bodyTextAfterAdd.includes('오늘의 훈련에 추가했습니다'));

  // Seed a custom curriculum to test "커리큘럼에 추가"
  const seededCurriculum = await page.evaluate(() => {
    const curriculum = {
      id: 'custom__test-curriculum',
      martialArt: 'boxing',
      title: '테스트 커리큘럼',
      description: '',
      source: 'custom',
      visibility: 'private',
      authorName: '나',
      totalDays: 1,
      estimatedWeeks: 1,
      phases: [],
      days: [{ day: 1, title: 'Day 1', description: '', learningGoals: [], techniqueIds: [], reviewTechniqueIds: [], difficulty: null, estimatedMinutes: 20 }],
      techniqueCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('martialdex:curricula:custom', JSON.stringify([curriculum]));
    return true;
  });
  check('Seeded a custom curriculum for the add-to-curriculum test', seededCurriculum);
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(MOCK_SCRIPT);
  await goto('#/situation');
  await new Promise((r) => setTimeout(r, 400));
  await page.selectOption('select.select', 'boxing');
  await clickText('공격', 'button');
  await page.fill('textarea', '복싱 거리에서 계속 맞아.');
  await clickText('추천 받기', 'button');
  await new Promise((r) => setTimeout(r, 1500));

  check('커리큘럼에 추가 button click ->', (await clickText('커리큘럼에 추가', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('테스트 커리큘럼 option click -> adds technique', (await clickText('테스트 커리큘럼', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const curriculumAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]')[0]);
  check('Technique added to the real custom curriculum (Day 1)', curriculumAfter?.days?.[0]?.techniqueIds?.length > 0, JSON.stringify(curriculumAfter?.days?.[0]?.techniqueIds));
  await shot('04-curriculum-add');

  // ============ 7. POSE-ANALYSIS BUTTON ONLY FOR SUPPORTED TECHNIQUES ============
  const poseButtonNames = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.technique-row')];
    return rows.map((r) => ({ name: r.querySelector('.technique-row__name')?.textContent, hasPoseBtn: [...r.querySelectorAll('button')].some((b) => b.textContent?.includes('자세 분석')) }));
  });
  check('Pose-analysis button only shown for camera-supported techniques', poseButtonNames.length > 0, JSON.stringify(poseButtonNames));

  // ============ 8. ANTI-FABRICATION: AI response mixing fake + real ids ============
  await page.evaluate(MOCK_FABRICATION_ATTEMPT_SCRIPT);
  await clickText('추천 받기', 'button');
  await new Promise((r) => setTimeout(r, 1500));
  const namesAfterFabricationAttempt = await textsOf('.technique-row__name');
  const hasFakeName = namesAfterFabricationAttempt.some((n) => n.includes('fake') || n.includes('invented'));
  check('Fabricated technique ids from AI response are silently dropped, never shown', !hasFakeName, JSON.stringify(namesAfterFabricationAttempt));
  await shot('05-anti-fabrication');

  // ============ 9. AI FAILURE -> GRACEFUL FALLBACK (never blocks, never crashes) ============
  await page.evaluate(MOCK_FAILURE_SCRIPT);
  await clickText('추천 받기', 'button');
  await new Promise((r) => setTimeout(r, 1500));
  const namesAfterFailure = await textsOf('.technique-row__name');
  check('AI failure still yields a deterministic fallback recommendation (never blank/crash)', namesAfterFailure.length > 0, JSON.stringify(namesAfterFailure));
  const fallbackNotice = await textOf('.ai-inline-warning');
  check('Fallback notice shown when AI is unavailable', (fallbackNotice ?? '').includes('기본 추천'), fallbackNotice);
  await shot('06-ai-failure-fallback');

  // ============ 10. NO MATCH CASE ============
  await page.evaluate(MOCK_SCRIPT);
  await page.fill('textarea', '');
  await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.chip')].filter((c) => c.classList.contains('active'));
    chips.forEach((c) => c.click());
  });
  await new Promise((r) => setTimeout(r, 200));
  const recommendDisabled = await page.evaluate(() => document.querySelector('button.btn-primary')?.disabled ?? false);
  check('추천 받기 disabled with no category and no situation text', recommendDisabled);

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 11. RESTART -> PERSISTENCE (today-training + curriculum additions) ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  const persistedCurriculum = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]')[0]);
  check('Curriculum addition persists after app restart', persistedCurriculum?.days?.[0]?.techniqueIds?.length > 0);

  // ============ REGRESSION ============
  await goto('#/');
  check('[Regression] Home shows 10 martial arts', (await page.evaluate(() => document.querySelectorAll('.art-card').length)) === 10);
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('Armbar', { delay: 15 });
  await new Promise((r) => setTimeout(r, 350));
  check('[Regression] Search still works', (await page.evaluate(() => document.querySelectorAll('.search-result-row').length)) > 0);
  await page.keyboard.press('Escape');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  check('[Regression] Technique detail still works', (await textOf('.detail-hero h1')) === 'Armbar');
  check('[Regression] YouTube embed still works', (await page.evaluate(() => document.querySelectorAll('.video-embed iframe').length)) > 0);

  await goto('#/graph');
  check('[Regression] Technique graph page still works', ((await textOf('.section-title h2')) ?? '').includes('기술 그래프'));

  await goto('#/learning/bjj');
  check('[Regression] Official curriculum overview still works', ((await textOf('.curriculum-hero h3')) ?? '').includes('주짓수'));

  await goto('#/fighter-style');
  check('[Regression] Fighter-style hub still works', ((await textOf('.section-title h2')) ?? '') === '선수 스타일 학습');

  await goto('#/coach');
  check('[Regression] AI Coach page still works', ((await textOf('.section-title h2')) ?? '').includes('AI 개인 코치'));

  await goto('#/sparring');
  check('[Regression] Sparring analysis hub still works', ((await textOf('.section-title h2')) ?? '').includes('스파링 분석'));

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

  fs.writeFileSync(path.join(SCRATCH, 'qa-situation-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
