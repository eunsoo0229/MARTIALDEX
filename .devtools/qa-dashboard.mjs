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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-dashboard-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  // ---- Empty state: fresh profile, no data anywhere ----
  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await sleep(600);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[빈 상태] 데이터 없을 때 크래시 없이 빈 상태 안내 표시', bodyText.includes('아직 훈련 기록이 없습니다') && bodyText.includes('진행 중인 커리큘럼이 없습니다'), bodyText.slice(0, 500));
  check('[빈 상태] Rank/Level은 항상 표시됨 (0 활동에서도 rank 1)', bodyText.includes('Level 1'), '');

  // ---- Seed real data across every Dashboard section's source ----
  const seeded = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum, ensureProgress } = await import('/src/lib/curriculum/curriculumService.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const { createTactic } = await import('/src/lib/tactic/service.ts');

    let box = createCustomCurriculum({ title: '대시보드 QA 복싱', description: '', martialArt: 'boxing', visibility: 'private' });
    box = addDay(box);
    box = addTechniqueToDay(box, 1, 'boxing__jab');
    box = saveCustomCurriculum(box);
    ensureProgress(box);

    let wres = createCustomCurriculum({ title: '대시보드 QA 레슬링', description: '', martialArt: 'wrestling', visibility: 'private' });
    wres = addDay(wres);
    wres = addTechniqueToDay(wres, 1, 'wrestling__basic-double-leg');
    wres = saveCustomCurriculum(wres);
    ensureProgress(wres);

    // Jab trained more than anything else this week -> deterministic AI 인사이트 target.
    for (let i = 0; i < 5; i++) {
      recordTrainingSession({ curriculumId: box.id, dayNumber: 1, techniqueIds: ['boxing__jab'], completed: true, estimatedMinutes: 10, actualMinutes: 10, notes: null, source: 'curriculum' });
    }
    recordTrainingSession({ curriculumId: wres.id, dayNumber: 1, techniqueIds: ['wrestling__basic-double-leg'], completed: true, estimatedMinutes: 15, actualMinutes: 15, notes: null, source: 'curriculum' });
    createTactic({ name: '대시보드 QA 전술', situation: 's', techniqueIds: ['boxing__jab'] });

    return { boxingCurriculumId: box.id, wrestlingCurriculumId: wres.id };
  });
  check('[seed] 실제 커리큘럼/훈련/전술 데이터 준비', !!seeded.boxingCurriculumId && !!seeded.wrestlingCurriculumId);

  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(200);
  const loadStart = Date.now();
  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await page.waitForFunction(() => document.body.innerText.includes('대시보드 QA 복싱'), { timeout: 5000 });
  const loadMs = Date.now() - loadStart;
  bodyText = await page.evaluate(() => document.body.innerText);

  check('[1][프로필] Rank/Badge 칩과 전체 진행률 표시', bodyText.includes('Level') && /배지/.test(bodyText) && bodyText.includes('전체 진행률'), bodyText.slice(0, 400));
  check('[2][최근 훈련] 실제 세션이 표시되고 "전체 기록 보기" 링크 존재', bodyText.includes('대시보드 QA 복싱') && bodyText.includes('전체 기록 보기'), '');
  check('[2][최근 훈련] 5~10개 제한 (과도한 전체 로드 없음)', (bodyText.match(/대시보드 QA/g) ?? []).length <= 10, '');
  check('[3][캘린더] 훈련 캘린더 섹션 렌더링', bodyText.includes('훈련 캘린더'), '');
  check('[4][무술별 밸런스] 복싱/레슬링 도넛 차트 범례 표시', bodyText.includes('무술별 훈련 밸런스') && bodyText.includes('복싱') && bodyText.includes('레슬링'), '');
  check('[5][커리큘럼] 진행 중인 두 커리큘럼과 달성률(%) 표시', bodyText.includes('대시보드 QA 복싱') && bodyText.includes('대시보드 QA 레슬링') && bodyText.includes('% 달성'), '');
  check('[6][AI 인사이트] Jab이 가장 많이 훈련한 기술로 결정론적으로 표시 (Gemini 호출 없이 즉시)', bodyText.includes('이번 주 가장 많이 훈련한 기술은 Jab입니다') && loadMs < 3000, `loadMs=${loadMs}`);

  // ---- Navigation shortcuts actually work ----
  await page.click('a:has-text("프로필 전체 보기")');
  await sleep(500);
  let url = await page.evaluate(() => location.href);
  check('[네비게이션] "프로필 전체 보기" -> /profile 이동', url.includes('/profile'), url);

  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await sleep(500);
  await page.click('a:has-text("전체 기록 보기")');
  await sleep(500);
  url = await page.evaluate(() => location.href);
  check('[네비게이션] "전체 기록 보기" -> /training-analytics/history 이동', url.includes('/training-analytics/history'), url);

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
