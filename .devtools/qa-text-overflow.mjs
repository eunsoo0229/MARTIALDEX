// UI text overflow audit — real Electron app at desktop (1280) and phone
// (375) widths. On every screen: types a long Korean sentence into every
// text field, adds a very long technique name, then reports
//   - horizontal page overflow (content wider than the window),
//   - textareas that don't wrap (scrollWidth > clientWidth),
//   - clipped text (overflow hidden/ellipsis with content wider than the box)
//     on buttons, chips, headings, labels, list names, messages.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const LONG = '상대가 무작정 밀고 들어올 때 잽으로 거리를 만들고 상대의 가드를 올린 뒤 바디 공격으로 연결하고 이후 테이크다운까지 연결하는 흐름을 연습하고 싶습니다.';
const LONG_NAME = 'Supercalifragilistic Rolling Inverted Double Underhook Body Lock Lateral Drop Variation';
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 700) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  ['AI 코치', '#/coach'],
  ['AI 코치 수업 설정', '#/coach/class', async (page) => {
    await page.locator('[data-testid="coach-location-home"]').click();
    await page.locator('[data-testid="coach-location-confirm"]').click();
  }],
  ['배운 기술', '#/learned-techniques'],
  ['Visualizing Mitt (AI 요청)', '#/coach/mitt'],
  ['Visualizing Mitt (콤보 만들기)', '#/coach/mitt', async (page) => page.locator('[data-testid="mitt-tab-build"]').click()],
  ['전체 기술', '#/techniques'],
  ['무술 상세', '#/arts/wrestling'],
  ['기술 상세 (긴 이름)', '#/arts/bjj/techniques/bjj__qa-long-name'],
  ['기술 목록 (긴 이름 검색)', '#/arts/bjj/techniques?q=Supercalifragilistic'],
  ['기술 요청', '#/techniques/request'],
  ['커리큘럼 목록', '#/learning/bjj'],
  ['커리큘럼 Day 목록', '#/learning/bjj/official__bjj'],
  ['훈련 시작', '#/learning/bjj/official__bjj/train'],
  ['AI 맞춤 커리큘럼', '#/ai-curriculum'],
  ['자유훈련', '#/free-training'],
  ['스파링 기록', '#/free-training/sparring'],
  ['콤보 만들기', '#/combos/new'],
  ['커뮤니티', '#/community'],
  ['프로필', '#/profile'],
  ['AI 코치 Day 수업(입력)', '#/learning/bjj/official__bjj/coach/1?mode=text&place=home'],
];

async function audit(page, label, width) {
  // fill every visible text field with the long sentence
  await page.evaluate((LONG) => {
    const setter = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    for (const el of document.querySelectorAll('textarea, input[type="text"], input:not([type])')) {
      if (el.closest('.header, header, .search-box')) continue;
      if (el.offsetParent === null || el.disabled || el.readOnly) continue;
      setter(el, LONG);
    }
  }, LONG);
  await sleep(500);
  return page.evaluate(({ width }) => {
    const problems = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      // find the widest offenders
      const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && el.offsetParent !== null).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]} →${Math.round(el.getBoundingClientRect().right)}px`);
      problems.push(`page overflow ${doc.scrollWidth}px > ${window.innerWidth}px: ${wide.join(', ')}`);
    }
    for (const ta of document.querySelectorAll('textarea')) {
      if (ta.offsetParent === null) continue;
      if (ta.scrollWidth > ta.clientWidth + 2) problems.push(`textarea not wrapping (${ta.dataset.testid ?? ta.id ?? ''}) ${ta.scrollWidth}>${ta.clientWidth}`);
      if (ta.clientWidth < 160) problems.push(`textarea too narrow (${ta.dataset.testid ?? ta.id ?? ''}) ${ta.clientWidth}px`);
    }
    const sel = 'button, .btn, .chip, h1, h2, h3, h4, label, .technique-row__name, .technique-row__sub, .ai-msg__bubble, .video-status-message, .ai-inline-warning, .detail-hero__korean, .breadcrumb span, .mitt-step-chip, .day-start-option';
    for (const el of document.querySelectorAll(sel)) {
      if (el.offsetParent === null || !el.textContent.trim()) continue;
      const cs = getComputedStyle(el);
      const clips = cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis';
      if (el.scrollWidth > el.clientWidth + 2 && (clips || cs.whiteSpace === 'nowrap')) {
        problems.push(`clipped ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
      }
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 && r.width > 0) problems.push(`off-screen ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}" right=${Math.round(r.right)}`);
    }
    return [...new Set(problems)].slice(0, 12);
  }, { width });
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-ovf-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 120000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await sleep(900);
  // A real (local) user technique with a very long name, plus some learning history.
  await page.evaluate(async (LONG_NAME) => {
    const repo = await import('/src/lib/userTechniques/repository.ts');
    const now = new Date().toISOString();
    repo.userTechniqueRepository.save({
      id: 'bjj__qa-long-name',
      technique: { id: 'bjj__qa-long-name', martialArt: 'bjj', name: LONG_NAME, koreanName: '아주아주긴이름의기술을테스트하기위한한국어이름입니다정말로깁니다', aliases: [], category: '탈출 기술 모음', positions: [], description: 'QA 전용 긴 이름 기술.', purpose: null, principles: [], variations: [], counters: [], defenses: [], transitions: [], relatedTechniques: [], relatedMartialArts: [], difficulty: null, tags: [], youtubeSearchQuery: null, videos: [] },
      status: 'approved', addedByUserId: null, duplicateCheck: { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '' }, verification: { verdict: 'confirmed', confidence: 90, martialArtConfirmed: 'bjj', category: null, evidenceNotes: [], canonicalName: null, reason: '' }, createdAt: now, updatedAt: now,
    });
    const h = await import('/src/lib/trainingHistory/service.ts');
    h.recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['bjj__qa-long-name', 'boxing__jab'], completed: true, estimatedMinutes: 10, source: 'free_training' });
  }, LONG_NAME);

  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [label, hash, prep] of ROUTES) {
      await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
      await page.evaluate(() => { window.location.hash = '#/'; });
      await sleep(250);
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await sleep(1400);
      if (prep) {
        try {
          await prep(page);
          await sleep(700);
        } catch (e) {
          check(`[${width}] ${label} — 준비 단계`, false, String(e).slice(0, 200));
          continue;
        }
      }
      if (hash.includes('/coach/1')) await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step !== 'explain', null, { timeout: 60000 }).catch(() => {});
      const problems = await audit(page, label, width);
      check(`[${width}px] ${label}: 텍스트 잘림·넘침 없음`, problems.length === 0, problems);
    }
  }
  // the reported case: goal textarea shows the whole long goal, wrapped
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { window.location.hash = '#/coach/class'; });
  await sleep(1200);
  await page.locator('[data-testid="coach-location-home"]').click();
  await page.locator('[data-testid="coach-location-confirm"]').click();
  await page.locator('[data-testid="coach-class-goal"]').fill(LONG);
  await sleep(300);
  const goal = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="coach-class-goal"]');
    const cs = getComputedStyle(ta);
    return { value: ta.value.length, sw: ta.scrollWidth, cw: ta.clientWidth, sh: ta.scrollHeight, ch: ta.clientHeight, ws: cs.whiteSpace, to: cs.textOverflow, w: Math.round(ta.getBoundingClientRect().width), card: Math.round(ta.closest('.card').getBoundingClientRect().width) };
  });
  check('[TEST 2] 운동 목표 긴 문장: 줄바꿈되어 전체가 보임 (가로 잘림 없음, 높이 자동 확장, 카드 폭 사용)', goal.ws === 'pre-wrap' && goal.sw <= goal.cw + 2 && goal.sh <= goal.ch + 2 && goal.w >= goal.card - 80, goal);
  await page.locator('[data-testid="coach-class-goal"]').screenshot({ path: '/tmp/goal-textarea.png' });
  check('[Z] 페이지 에러 없음', errors.length === 0, errors);
  await app.close();
  const passed = results.filter((x) => x.pass).length;
  console.log(`=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed !== results.length) console.log('FAILURES:', results.filter((x) => !x.pass).map((x) => x.name));
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
