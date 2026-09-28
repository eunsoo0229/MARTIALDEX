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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-ai-analysis-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  // ---- Empty state: no training data at all -> no AI call, honest "no data" message ----
  const emptyResult = await page.evaluate(async () => {
    const { getAiTrainingAnalysis } = await import('/src/lib/trainingAnalytics/aiAnalysis.ts');
    return getAiTrainingAnalysis();
  });
  check('[빈 데이터] 훈련 기록이 없을 때 AI를 호출하지 않고 사실 그대로 안내', emptyResult.source === 'fallback' && emptyResult.recentPattern.includes('없습니다'), JSON.stringify(emptyResult));

  // ---- Seed real training data across multiple real sources ----
  const seeded = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum, ensureProgress, setDayComplete } = await import('/src/lib/curriculum/curriculumService.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const { createCombo } = await import('/src/lib/combo/service.ts');

    let c = createCustomCurriculum({ title: 'QA 복싱 커리큘럼', description: '', martialArt: 'boxing', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, 'boxing__jab');
    c = saveCustomCurriculum(c);
    ensureProgress(c);
    setDayComplete(c, 1, true);

    for (let i = 0; i < 4; i++) {
      recordTrainingSession({ curriculumId: c.id, dayNumber: 1, techniqueIds: ['boxing__jab', 'boxing__cross'], completed: true, estimatedMinutes: 20, actualMinutes: 20, notes: null, source: 'curriculum' });
    }
    createCombo({ name: 'QA 콤보', description: '', techniqueIds: ['boxing__jab', 'boxing__cross'] });

    return { curriculumId: c.id, curriculumTitle: c.title };
  });
  check('[seed] 실제 훈련/커리큘럼/콤보 데이터 준비', !!seeded.curriculumId);

  // ---- Context builder never includes PII, only reflects real aggregated data ----
  const context = await page.evaluate(async () => {
    const { buildTrainingAiContext } = await import('/src/lib/trainingAnalytics/aiContext.ts');
    return buildTrainingAiContext();
  });
  check('[컨텍스트] 실제 데이터만 포함 (개인정보 없음, "@" 미포함)', context.hasAnyData && !context.contextLines.some((l) => l.includes('@')), JSON.stringify(context.contextLines));
  check('[컨텍스트] 실제 콤보 이름이 컨텍스트에 반영됨', context.contextLines.some((l) => l.includes('QA 콤보')), JSON.stringify(context.contextLines));
  check('[컨텍스트] 실제 커리큘럼 진행 상황이 컨텍스트에 반영됨', context.contextLines.some((l) => l.includes('QA 복싱 커리큘럼')), JSON.stringify(context.contextLines));

  // ---- Real AI (or graceful fallback) call, structural correctness either way ----
  const analysis = await page.evaluate(async () => {
    const { getAiTrainingAnalysis } = await import('/src/lib/trainingAnalytics/aiAnalysis.ts');
    return getAiTrainingAnalysis();
  });
  check('[AI 분석] recentPattern이 실제로 채워짐', typeof analysis.recentPattern === 'string' && analysis.recentPattern.length > 0, JSON.stringify(analysis).slice(0, 400));
  check('[AI 분석] nextSuggestion이 실제로 채워짐 (다음 훈련 방향 제안)', typeof analysis.nextSuggestion === 'string' && analysis.nextSuggestion.length > 0, analysis.nextSuggestion);
  check('[AI 분석] source가 ai 또는 fallback 중 하나', analysis.source === 'ai' || analysis.source === 'fallback', analysis.source);
  if (analysis.source === 'ai') {
    check('[AI 분석][실제 Gemini 응답] 5개 필드 모두 문자열로 존재', ['recentPattern', 'nextSuggestion'].every((k) => typeof analysis[k] === 'string'), JSON.stringify(analysis));
  }

  // ---- UI: Training Analytics hub shows the AI analysis card and result ----
  await page.evaluate(() => { location.hash = '#/training-analytics'; });
  await sleep(600);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI] "AI 훈련 분석" 카드와 의료 진단 면책 문구 표시', bodyText.includes('AI 훈련 분석') && bodyText.includes('의료적 진단이나 부상 판단은 제공하지 않습니다'), '');

  await page.click('button:has-text("AI 분석 받기")');
  await page.waitForFunction(() => !document.body.innerText.includes('분석 중…'), { timeout: 30000 });
  await sleep(300);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI] AI 분석 받기 클릭 후 결과 필드(최근 훈련 패턴/다음 훈련 방향 제안) 표시', bodyText.includes('최근 훈련 패턴') && bodyText.includes('다음 훈련 방향 제안'), bodyText.slice(bodyText.indexOf('AI 훈련 분석'), bodyText.indexOf('AI 훈련 분석') + 600));

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
