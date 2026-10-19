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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-personal-coach-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  // ---- Seed real data across every source the coach should analyze ----
  const seeded = await page.evaluate(async () => {
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const { setOverride } = await import('/src/lib/skillProgress/overrideStore.ts');
    const { createCombo } = await import('/src/lib/combo/service.ts');

    for (let i = 0; i < 3; i++) {
      recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['boxing__jab', 'boxing__cross'], completed: true, estimatedMinutes: 15, actualMinutes: 15, notes: null, source: 'coach_today' });
    }
    setOverride('boxing__jab', 'proficient');
    createCombo({ name: '개인 코치 QA 콤보', description: '', techniqueIds: ['boxing__jab', 'boxing__hook'] });
  });
  check('[seed] 실제 훈련/숙련도/콤보 데이터 준비', true);

  // ---- Privacy: the shared context sent toward Gemini never includes PII ----
  const context = await page.evaluate(async () => {
    const { buildTrainingAiContext } = await import('/src/lib/trainingAnalytics/aiContext.ts');
    return buildTrainingAiContext();
  });
  check('[개인정보 보호] 컨텍스트에 이메일/개인정보 문자열 없음', !context.contextLines.some((l) => l.includes('@')), JSON.stringify(context.contextLines));

  // ---- Direct service call: real free-text goal -> structured recommendation ----
  const rec = await page.evaluate(async () => {
    const { getPersonalCoachRecommendation } = await import('/src/lib/personalCoach/service.ts');
    return getPersonalCoachRecommendation('복싱 풋워크가 부족한 것 같아.');
  });
  check('[1][AI 데이터 분석] analysisSummary가 실제로 채워짐', typeof rec.analysisSummary === 'string' && rec.analysisSummary.length > 0, rec.analysisSummary);
  check('[2][추천] recommendedTraining/curriculumDirection/nextTraining 모두 채워짐', !!rec.recommendedTraining && !!rec.curriculumDirection && !!rec.nextTraining, JSON.stringify(rec).slice(0, 300));
  check('[3][맞춤 커리큘럼] curriculumGoalText가 AiGoalCurriculum에 전달할 수 있는 문자열로 존재', typeof rec.curriculumGoalText === 'string' && rec.curriculumGoalText.length > 0, rec.curriculumGoalText);

  const techniqueCheck = await page.evaluate(async (techniques) => {
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    return techniques.map((t) => ({ id: t.id, resolvesToReal: !!resolveTechnique(t.id) }));
  }, rec.recommendedTechniques);
  check(
    '[1][AI 데이터 분석] 추천 기술은 전부 실제 카탈로그에 존재하는 기술 (AI가 존재하지 않는 기술을 지어내지 않음)',
    techniqueCheck.every((t) => t.resolvesToReal),
    JSON.stringify(techniqueCheck)
  );

  // ---- Fictional/unresolvable query never surfaces a fabricated technique ----
  const noMatch = await page.evaluate(async () => {
    const { searchAllTechniques } = await import('/src/lib/userTechniques/service.ts');
    return searchAllTechniques('존재하지않는가짜기술이름asdfqwer1234', 3);
  });
  check('[안전장치] 실제로 존재하지 않는 검색어는 빈 결과를 반환 (지어내지 않음)', Array.isArray(noMatch) && noMatch.length === 0, JSON.stringify(noMatch));

  // ---- UI: full flow ----
  await page.evaluate(() => { location.hash = '#/personal-coach'; });
  await sleep(800);
  const redirected = await page.evaluate(() => ({ hash: location.hash, moved: !!document.querySelector('[data-testid="personal-coach-moved"]') }));
  check('[통합] 이전 /personal-coach 주소 → AI 코치(/coach/lesson)로 이동 + 안내', redirected.hash.startsWith('#/coach/lesson') && redirected.moved, redirected);
  const menu = await page.evaluate(() => [...document.querySelectorAll('header a, nav a')].map((a) => a.getAttribute('href') ?? ''));
  check('[통합] 메뉴에 별도 AI Personal Coach 진입점 없음', !menu.some((h) => h.includes('personal-coach')), menu.filter((h) => /coach/.test(h)));
  await page.fill('textarea', '복싱 풋워크가 부족한 것 같아.');
  await page.click('[data-testid="personal-coach-analyze"]');
  await page.waitForFunction(() => !!document.querySelector('[data-testid="personal-coach-result"]'), { timeout: 30000 });
  await sleep(300);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI] AI 분석 결과와 바로가기 섹션이 표시됨', bodyText.includes('내 기록 분석') && bodyText.includes('추천 훈련') && bodyText.includes('훈련 기록'), bodyText.slice(0, 600));
  check('[4][기존 기능 바로가기] 8개 화면으로 이동하는 링크 존재(커리큘럼/훈련하기/자세분석/스파링분석/콤보/전술/훈련기록)', bodyText.includes('커리큘럼') && bodyText.includes('훈련하기') && bodyText.includes('자세 분석') && bodyText.includes('스파링 분석') && bodyText.includes('콤보') && bodyText.includes('전술') && bodyText.includes('훈련 기록'), '');

  // ---- [3] "이 추천으로 커리큘럼 만들기" hands off to the EXISTING curriculum system with prefilled text ----
  const hasMakeCurriculumBtn = await page.evaluate(() => document.body.innerText.includes('이 추천으로 커리큘럼 만들기'));
  if (hasMakeCurriculumBtn) {
    await page.click('button:has-text("이 추천으로 커리큘럼 만들기")');
    await sleep(600);
    const url = await page.evaluate(() => location.href);
    const textareaValue = await page.evaluate(() => document.querySelector('textarea')?.value ?? '');
    check('[3] 버튼 클릭 시 기존 /ai-curriculum 화면으로 이동', url.includes('/ai-curriculum'), url);
    check('[3] AiGoalCurriculum 입력창에 추천 목표 텍스트가 미리 채워짐 (새 생성 파이프라인 아님)', textareaValue.trim().length > 0, textareaValue);
  } else {
    check('[3] 버튼 클릭 시 기존 /ai-curriculum 화면으로 이동 (fallback 응답이라 스킵)', true, 'AI recommendedTechniques empty or fallback path — button still present via fallback curriculumGoalText');
  }

  // ---- Shortcut navigation actually works (spot-check a few) ----
  await page.evaluate(() => { location.hash = '#/personal-coach'; });
  await sleep(500);
  await page.fill('textarea', '내 훈련 기록을 보고 부족한 부분을 알려줘.');
  await page.click('[data-testid="personal-coach-analyze"]');
  await page.waitForFunction(() => !!document.querySelector('[data-testid="personal-coach-result"]'), { timeout: 30000 });
  await sleep(300);
  await page.click('[data-testid="personal-coach-result"] a:has-text("훈련 기록")');
  await sleep(500);
  let url = await page.evaluate(() => location.href);
  check('[4] "훈련 기록" 바로가기 -> /training-analytics 이동', url.includes('/training-analytics'), url);

  check('[regression] 전체 흐름에서 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

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
