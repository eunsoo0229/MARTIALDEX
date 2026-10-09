// QA: 「수업하고 싶은 거 입력하기」 — classification, real Tavily search usage, lesson
// grounding, AI Coach entry, no curriculum. Uses the REAL Gemini + Tavily paths.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const SHOT_DIR = process.env.SHOT_DIR;
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { input: '오늘 Jab을 배우고 싶어', expect: ['technique', 'technique_goal'], search: true },
  { input: '오늘 Double Leg을 배우고 싶어', expect: ['technique', 'technique_goal'], search: true },
  { input: '오늘 복싱을 배우고 싶어', expect: ['topic'], search: true },
  { input: '오늘 거리 조절을 배우고 싶어', expect: ['topic'], search: true },
  { input: '오늘 공격을 잘하고 싶어', expect: ['topic'], search: true },
  { input: '오늘 스파링을 잘하고 싶어', expect: ['topic'], search: true },
  { input: '오늘 키 큰 상대를 상대하는 법을 배우고 싶어', expect: ['topic'], search: true },
  { input: '오늘 잽으로 거리를 조절하는 법을 배우고 싶어', expect: ['technique_goal'], search: true },
  { input: 'Double Leg을 MMA에서 어떻게 사용하는지 배우고 싶어', expect: ['technique_goal'], search: true },
  { input: '오늘 MMA에서 공격을 잘하고 싶어', expect: ['topic'], search: true },
  { input: '오늘 복싱 거리 조절을 배우고 싶어', expect: ['topic'], search: true },
];

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-oneoff-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(800);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let searchCalls = 0;
  page.on('console', (m) => {
    if (m.text().includes('[CURRICULUM_TAVILY_RUNTIME] phase=transport_select')) searchCalls++;
  });
  // A learned Jab, so a distance lesson can link back to it.
  await page.evaluate(async () => {
    const { searchTechniques } = await import('/src/lib/search.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const jab = searchTechniques('jab', 1, { martialArt: 'boxing' })[0];
    recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: [jab.id], completed: true, estimatedMinutes: 10, source: 'free_training' });
  });
  const curriculaBefore = await page.evaluate(() => localStorage.getItem('martialdex:curricula:custom') ?? '[]');

  for (const c of CASES) {
    const before = searchCalls;
    const r = await page.evaluate(async (input) => {
      const { buildOneOffLesson } = await import('/src/lib/coachLesson/oneOff.ts');
      const res = await buildOneOffLesson(input, null);
      if (!res.ok) return { ok: false, code: res.code, message: res.message, mode: res.classification?.mode ?? null };
      const l = res.lesson;
      return {
        ok: true,
        mode: l.mode,
        method: res.classification.method,
        technique: l.techniqueId,
        title: l.title,
        concepts: l.context.concepts.map((x) => x.label),
        webConcepts: l.context.concepts.filter((x) => x.id.startsWith('web-')).length,
        sources: l.sources.map((s) => s.domain),
        webCalled: l.webSearch.called,
        webUsed: l.webSearch.used,
        links: l.linkedLearned.map((x) => x.line),
        queries: l.webSearch.queries,
      };
    }, c.input);
    const calls = searchCalls - before;
    const modeOk = r.mode && c.expect.includes(r.mode);
    const searchOk = c.search === null ? true : c.search ? calls > 0 : calls === 0;
    const builtOk = r.ok && r.concepts.length >= 2;
    const groundedOk = !r.ok || r.mode === 'technique' ? true : r.webConcepts > 0 ? r.sources.length >= 2 && new Set(r.sources).size >= 2 && r.webUsed : !!r.technique;
    check(`[${c.input}] → ${c.expect.join('/')}${c.search ? ' + 실시간 검색' : c.search === false ? ' (DB만)' : ''}`, modeOk && searchOk && builtOk && groundedOk, JSON.stringify({ ...r, searchCalls: calls }));
    console.log('   ', JSON.stringify({ mode: r.mode, title: r.title, concepts: r.concepts, sources: r.sources, calls, links: r.links }));
  }

  // ---------- UI: topic lesson end to end ----------
  await page.evaluate(() => (location.hash = '#/coach'));
  await sleep(800);
  check('[UI1] AI 코치 화면에 "수업하고 싶은 거 입력하기" 진입점', !!(await page.$('[data-testid="oneoff-entry"]')));
  await page.locator('[data-testid="oneoff-entry"] a').click();
  await sleep(600);
  await page.locator('[data-testid="oneoff-request"]').fill('오늘 복싱 거리 조절을 배우고 싶어');
  const callsBeforeUi = searchCalls;
  await page.locator('[data-testid="oneoff-build"]').click();
  await page.waitForSelector('[data-testid="oneoff-lesson"]', { timeout: 180000 });
  const mode = await page.locator('[data-testid="oneoff-lesson"]').getAttribute('data-mode');
  const webUsed = await page.locator('[data-testid="oneoff-lesson"]').getAttribute('data-web-used');
  check('[UI2] UI에서 오늘 수업 생성 → 실시간 검색 기반, 검색 자료 반영', mode === 'topic' && webUsed === 'true' && searchCalls > callsBeforeUi, JSON.stringify({ mode, webUsed }));
  const firstCoach = await page.locator('.oneoff-msg--coach').first().textContent();
  check('[UI3] AI 코치가 바로 수업을 시작 (첫 설명/질문)', (firstCoach ?? '').length > 10, firstCoach);
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, 'oneoff-start.png'), fullPage: true });

  // Drive the lesson to the end like a student (mix of answers / understood / practice).
  const replies = ['이해했어', '상대와 너무 가까우면 맞기 쉬우니까 잽과 스텝으로 거리를 유지해요', '이해했어', '모르겠어', '이해했어', '뒤로만 빠지지 않고 옆으로 각도를 바꿔요'];
  let turns = 0;
  let sawFeedback = false;
  while (turns < 45) {
    if (await page.$('[data-testid="oneoff-complete"]')) break;
    if (await page.$('[data-testid="oneoff-video-done"]')) await page.locator('[data-testid="oneoff-video-done"]').click();
    else if (await page.$('[data-testid="oneoff-practice-done"]')) await page.locator('[data-testid="oneoff-practice-done"]').click();
    else if (await page.$('[data-testid="oneoff-answer"]')) {
      await page.locator('[data-testid="oneoff-answer"]').fill(replies[turns % replies.length]);
      await page.locator('.oneoff-input button[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector('.oneoff-input button[disabled]') || !document.querySelector('.oneoff-input'), null, { timeout: 90000 }).catch(() => {});
    }
    await sleep(400);
    turns++;
    const n = await page.locator('.oneoff-msg--coach').count();
    if (n > 3) sawFeedback = true;
  }
  const done = !!(await page.$('[data-testid="oneoff-complete"]'));
  check('[UI4] 설명 → 질문 → 답변/이해도 판단 → 실습 → 복습 → 수업 완료', done && sawFeedback, `turns=${turns}`);
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, 'oneoff-done.png'), fullPage: true });
  const after = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return { curricula: localStorage.getItem('martialdex:curricula:custom') ?? '[]', entry: listTrainingHistory().find((e) => e.notes?.startsWith('AI 코치 1회 수업')) ?? null };
  });
  check('[UI5] 완료 시 오늘 훈련 기록 1건 저장 (AI 코치)', !!after.entry && after.entry.source === 'coach_today' && after.entry.aiCoach?.mode === 'text', JSON.stringify(after.entry));
  check('[C1] 모든 테스트에서 커리큘럼 생성/저장 없음', after.curricula === curriculaBefore, after.curricula.slice(0, 200));

  // ---------- UI: technique lesson enters the coach normally ----------
  await page.evaluate(() => (location.hash = '#/coach/lesson'));
  await sleep(800);
  const callsBeforeJab = searchCalls;
  await page.locator('[data-testid="oneoff-request"]').fill('오늘 Jab을 배우고 싶어');
  await page.locator('[data-testid="oneoff-build"]').click();
  await page.waitForSelector('[data-testid="oneoff-lesson"]', { timeout: 120000 });
  check('[UI6] 특정 기술 수업도 실시간 검색 사용 + AI 코치 진입', ['technique', 'technique_goal'].includes(await page.locator('[data-testid="oneoff-lesson"]').getAttribute('data-mode')) && searchCalls > callsBeforeJab && (await page.locator('.oneoff-msg--coach').count()) > 0);

  // ---------- regression: existing AI 코치 pages still load ----------
  for (const [hash, sel] of [['#/coach', '[data-testid="coach-class-entry"]'], ['#/coach/class', '[data-testid="coach-class-setup"]']]) {
    await page.evaluate((h) => (location.hash = h), hash);
    await sleep(800);
    check(`[R] ${hash} 기존 화면 정상`, !!(await page.$(sel)));
  }
  check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
