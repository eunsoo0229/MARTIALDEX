// 복습 5종 — in-app QA (Electron + Vite dev server on :5173).
// Seeds local records, then walks the hub, each mode, a lesson review with an
// understanding check, and verifies the review lands in the review log only.
// Run: node .devtools/qa-review-modes.mjs
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-review-modes-'));
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env, timeout: 30000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(900);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const goto = async (h) => {
  await page.evaluate((x) => (location.hash = x), h);
  await sleep(700);
};
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const body = () => page.evaluate(() => document.body.textContent ?? '');

// ---------- seed
await page.evaluate(() => {
  localStorage.clear();
  const DAY = 86400000;
  const iso = (d) => new Date(Date.now() - d * DAY).toISOString();
  const base = (id, d, extra = {}) => ({ id, date: iso(d).slice(0, 10), completedAt: iso(d), updatedAt: iso(d), curriculumId: null, dayNumber: null, techniqueIds: ['boxing__jab'], completed: true, estimatedMinutes: 10, actualMinutes: 12, notes: null, source: 'coach_today', ...extra });
  localStorage.setItem(
    'martialdex:training-history',
    JSON.stringify([
      base('h_personal', 1, { exerciseDetails: [{ techniqueId: 'boxing__jab', mode: 'reps', sets: 3, targetReps: 10, targetSeconds: null, actualReps: [10, 10, null], actualSeconds: [null, null, null], restSeconds: 30, startedAt: null, finishedAt: null }] }),
      base('h_ai', 2, { techniqueIds: ['bjj__armbar'], aiCoach: { location: 'home', mode: 'text' }, notes: '암바 수업' }),
      base('h_gym', 3, { source: 'gym_class', techniqueIds: ['bjj__armbar'], gymClassMeta: { gymId: 'g', gymName: 'QA짐', classTitle: '암바 기본', sessionId: 's' } }),
      base('h_review_legacy', 1, { source: 'review' }),
    ])
  );
  localStorage.setItem(
    'martialdex:coach-lesson-log',
    JSON.stringify([
      { id: 'lesson_qa', kind: 'one_off', title: '암바 수업', date: iso(2).slice(0, 10), startedAt: iso(2), finishedAt: iso(2), curriculumId: null, day: null, historyEntryId: 'h_ai', techniques: [{ techniqueId: 'bjj__armbar', name: 'Armbar', overall: 'partial', practiced: true, concepts: [{ id: 'c1', label: '무릎 조이기', explain: '양 무릎을 붙여 팔을 고정한다', reference: '무릎을 조여 팔 고정', status: 'weak', evidence: '잘 모르겠어요' }, { id: 'c2', label: '엉덩이 들기', explain: '엉덩이를 들어 팔꿈치를 편다', reference: '엉덩이를 들어 신전', status: 'understood' }] }], qa: [{ question: '엄지 방향은?', answer: '엄지가 위를 향하게 잡습니다.' }], recap: null, updatedAt: iso(2) },
    ])
  );
});
await page.reload();
await page.waitForLoadState('load');
await sleep(900);

// ---------- hub
await goto('#/review');
check('[허브] 5가지 복습 카드', (await count('[data-testid^="review-mode-"]')) === 5);
const counts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid^="review-count-"]')].map((e) => [e.getAttribute('data-testid').replace('review-count-', ''), parseInt(e.textContent, 10)])));
check('[허브] 전 훈련 3 (이전 "review" 기록 제외) · 수업 1 · 체육관 1', counts.training === 3 && counts.lesson === 1 && counts.gym === 1, counts);
check('[허브] 부족 기술 ≥1 (수업에서 이해 부족 개념)', counts.weak >= 1, counts);
await page.screenshot({ path: path.join(SHOT_DIR, '01-hub.png') });

// ---------- mode 1
await goto('#/review/training');
await page.click('text=전체');
await sleep(300);
check('[전 훈련] 기록 3건 표시', (await count('[data-testid="review-entry"]')) === 3);
check('[전 훈련] 기록된 세트·반복만 표시 (2세트 · 20회)', (await body()).includes('완료 세트 2') && (await body()).includes('반복 20회'));
await page.click('[data-testid="review-kind-gym"]');
await sleep(300);
check('[전 훈련] 체육관 필터 → 1건', (await count('[data-testid="review-entry"]')) === 1);

// ---------- mode 3
await goto('#/review/gym');
const gymKinds = await page.evaluate(() => [...document.querySelectorAll('[data-testid="review-entry"]')].map((e) => e.getAttribute('data-kind')));
check('[체육관] 체육관 기록만', gymKinds.length === 1 && gymKinds[0] === 'gym', gymKinds);
check('[체육관] 체육관 이름·수업 제목 표시', (await body()).includes('QA짐 · 암바 기본'));

// ---------- mode 2
await goto('#/review/lessons');
check('[수업] 수업 1건', (await count('[data-testid="review-lesson"]')) === 1);
await page.click('text=수업 내용 보기');
await sleep(600);
const detail = await body();
check('[수업 상세] 설명·내 답·질문과 답 표시', detail.includes('양 무릎을 붙여') && detail.includes('잘 모르겠어요') && detail.includes('엄지가 위를 향하게'));
await page.screenshot({ path: path.join(SHOT_DIR, '02-lesson.png') });
const historyBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:training-history')).length);
await page.click('[data-testid="review-lesson-start"]');
await sleep(800);
check('[수업 복습] 세션 화면 (mode=lesson)', (await page.getAttribute('[data-testid="review-session"]', 'data-mode')) === 'lesson');
const q = await text('[data-testid="review-check"] p');
check('[수업 복습] 이해 부족 개념부터 질문', !!q && q.includes('무릎'), q);
await page.click('[data-testid="review-check-dontknow"]');
await sleep(500);
check('[수업 복습] "모르겠어요" → 핵심 설명 피드백', ((await text('[data-testid="review-check-feedback"]')) ?? '').includes('양 무릎'));
await page.click('[data-testid="review-difficult"]');
await sleep(800);
check('[수업 복습] 완료 화면', (await count('[data-testid="review-session-done"]')) === 1);
const after = await page.evaluate(() => ({ history: JSON.parse(localStorage.getItem('martialdex:training-history')).length, log: JSON.parse(localStorage.getItem('martialdex:review-log') || '[]') }));
const entry = after.log[0];
check('[수업 복습] 훈련 기록 수 변화 없음 (복습 ≠ 훈련)', after.history === historyBefore, { before: historyBefore, after: after.history });
check('[수업 복습] 복습 기록 저장 (mode lesson · 결과 1 · 어려움 1)', entry?.mode === 'lesson' && entry.sourceRef === 'lesson_qa' && entry.results.length === 1 && entry.results[0].verdict === 'weak' && entry.difficultTechniqueIds.includes('bjj__armbar') && !!entry.finishedAt, entry);

// ---------- mode 4
await goto('#/review/weak');
const weakTxt = await body();
check('[부족 기술] Armbar가 근거와 함께 표시', weakTxt.includes('Armbar') && weakTxt.includes('아직 어려워요') && weakTxt.includes('무릎 조이기'));
check('[부족 기술] 모든 항목에 근거 문장', await page.evaluate(() => [...document.querySelectorAll('[data-testid="review-weak-item"]')].every((e) => e.querySelectorAll('.review-reasons li').length > 0)));

// typed answer path (AI grader, keyword fallback when AI unavailable)
await page.click('[data-testid="review-weak-start"]');
await sleep(800);
await page.fill('[data-testid="review-check-answer"]', '양 무릎을 꽉 조여서 팔을 고정합니다');
await page.click('[data-testid="review-check-submit"]');
await page.waitForSelector('[data-testid="review-check-feedback"]', { timeout: 60000 }).catch(() => null);
const verdict = await page.getAttribute('[data-testid="review-check-feedback"]', 'data-verdict').catch(() => null);
check('[부족 기술 복습] 답 확인 결과가 나옴 (AI 또는 키워드 판정)', ['understood', 'partial', 'weak', 'unknown'].includes(verdict ?? ''), verdict);
const method = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:review-log'))[0]?.results?.[0]?.method);
console.log('   grading method:', method);

// ---------- mode 5 still works
await goto('#/review/ai');
await page.waitForFunction(() => document.body.textContent?.includes('오늘의 복습'), null, { timeout: 8000 }).catch(() => null);
const aiBody = await body();
check('[AI 추천] 기존 오늘의 복습 화면 유지', aiBody.includes('오늘의 복습'));
await goto('#/');
check('[홈] 정상 표시', (await count('.art-card')) > 0);

check('콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
console.log('screenshots:', SHOT_DIR);
await app.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
