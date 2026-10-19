// AI 코치 탭 = MARTIALDEX AI 기능 전체 — in the real Electron app.
// Opens the AI 코치 tab, checks the catalog (groups, search), then follows
// EVERY card to its real screen and confirms the screen renders (no error
// boundary, no page error); deep links (AI 식단 사진/글/생성, 기록 분석) open
// the feature itself; the chat card opens the AI chat; the header has no
// separate AI menu and highlights "AI 코치" on AI screens.
// No AI request is made. Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 400) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-aihub-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 60000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await sleep(1000);
  const go = async (hash) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(900);
  };

  // ---- header: AI 코치 is the one AI entry
  await go('#/');
  const nav = await page.evaluate(() => ({ links: [...document.querySelectorAll('header a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]), groups: [...document.querySelectorAll('.nav-more__group')].map((g) => g.textContent.slice(0, 20)) }));
  check('[N1] 상단 메뉴에 "AI 코치" 탭', nav.links.some(([t, h]) => t === 'AI 코치' && h === '#/coach'));
  check('[N2] 별도 "AI" 메뉴 그룹 및 AI 전용 화면 중복 링크 없음', !nav.links.some(([, h]) => /#\/(ai-combo|ai-history|ai-curriculum|fighter-style|my-style|personal-coach)$|#\/sparring$/.test(h ?? '')), nav.links.filter(([, h]) => /ai|style|sparring|coach/.test(h ?? '')));

  // ---- the catalog
  await go('#/coach');
  const cat = await page.evaluate(() => ({
    total: document.querySelectorAll('[data-testid="ai-feature-catalog"] .ai-feature-card').length,
    tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()),
    status: !!document.querySelector('.curriculum-stat-row'),
    heading: document.querySelector('.section-title h2')?.textContent,
  }));
  const catalog = await page.evaluate(async () => (await import('/src/lib/aiCoach/aiFeatureCatalog.ts')).AI_FEATURES.map((f) => ({ id: f.id, to: f.to, action: f.action ?? null, group: f.group })));
  check('[C1] AI 코치 탭에 AI 기능 전체 카드 표시 (카탈로그와 동일 개수)', cat.total === catalog.length && cat.total >= 20, cat);
  check('[C2] 분류 탭(전체·수업·기술·커리큘럼·분석·홈트/영양·기록)', cat.tabs.length === 7, cat.tabs);
  check('[C3] 기존 AI 코치 내용(현재 상태·오늘의 코칭) 유지', cat.status && cat.heading?.includes('AI 코치'), cat);
  await page.click('[data-testid="ai-tab-fitness"]');
  await sleep(300);
  const fitness = await page.evaluate(() => ({ hash: location.hash, ids: [...document.querySelectorAll('.ai-feature-card')].map((c) => c.dataset.feature) }));
  check('[C4] 분류 탭: 홈트·헬스·영양만 표시, 주소에 탭 유지', fitness.hash.includes('tab=fitness') && fitness.ids.every((id) => catalog.find((f) => f.id === id)?.group === 'fitness') && fitness.ids.length === catalog.filter((f) => f.group === 'fitness').length, fitness);
  await page.fill('[data-testid="ai-feature-search"]', '콤보');
  await sleep(300);
  const search = await page.evaluate(() => [...document.querySelectorAll('.ai-feature-card')].map((c) => c.dataset.feature));
  check('[C5] 검색: "콤보" → AI 콤비네이션 포함', search.includes('ai-combo'), search);
  await page.fill('[data-testid="ai-feature-search"]', '');
  await page.click('[data-testid="ai-tab-all"]');

  // ---- the chat card opens the AI chat
  await page.click('[data-testid="ai-feature-ask-button"]');
  await sleep(500);
  const modal = await page.evaluate(() => !!document.querySelector('.modal-panel.ai-modal'));
  check('[C6] "AI에게 직접 물어보기" 카드 → AI 대화창', modal);
  await page.evaluate(() => document.querySelector('.modal-overlay')?.click());
  await go('#/');

  // ---- every card leads to a working screen
  const broken = [];
  for (const f of catalog.filter((x) => !x.action)) {
    await go('#/coach');
    const clicked = await page.evaluate((id) => {
      const a = document.querySelector(`[data-feature="${id}"] a`);
      if (!a) return null;
      a.click();
      return a.getAttribute('href');
    }, f.id);
    await sleep(1100);
    const state = await page.evaluate(() => ({
      hash: location.hash,
      crashed: /문제가 발생했습니다|Something went wrong/.test(document.body.innerText) && !!document.querySelector('.error-state, [data-testid="app-error"]'),
      text: document.querySelector('.container')?.innerText.trim().length ?? 0,
      title: document.querySelector('.section-title h2, h2')?.textContent?.trim() ?? '',
    }));
    const expectPath = f.to.split('?')[0];
    const ok = clicked !== null && state.hash.startsWith(`#${expectPath}`) && !state.crashed && state.text > 30;
    if (!ok) broken.push({ id: f.id, clicked, ...state });
    console.log(`   ${ok ? '✓' : '✗'} ${f.id} → ${state.hash} | ${state.title}`);
  }
  check(`[L1] 모든 카드(${catalog.filter((x) => !x.action).length}개)가 실제 화면으로 이동해 정상 표시`, broken.length === 0, broken);

  // ---- deep links open the feature itself
  const deep = {};
  for (const kind of ['photo', 'text', 'gen']) {
    await go('#/');
    await go(`#/nutrition?ai=${kind}`);
    await sleep(400);
    deep[kind] = await page.evaluate(() => ({ modal: !!document.querySelector('.modal-panel'), text: (document.querySelector('.modal-panel')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 40), hash: location.hash }));
    await page.evaluate(() => document.querySelector('.modal-overlay')?.click());
  }
  check('[D1] AI 식단 카드 → 영양 화면에서 해당 AI 창(사진·글·식단 생성)이 바로 열림', Object.values(deep).every((d) => d.modal) && Object.values(deep).every((d) => !d.hash.includes('ai=')), deep);
  await go('#/coach/lesson?mode=analysis');
  const hint = await page.evaluate(() => ({ hint: !!document.querySelector('[data-testid="personal-coach-hint"]'), btn: !!document.querySelector('[data-testid="personal-coach-analyze"]') }));
  check('[D2] "내 기록 분석·추천" 카드 → 분석 안내 + 분석 버튼', hint.hint && hint.btn, hint);

  // ---- header highlight on AI screens
  await go('#/ai-combo');
  const active = await page.evaluate(() => [...document.querySelectorAll('header a.active')].map((a) => a.textContent.trim()));
  check('[N3] AI 화면(/ai-combo)에서 상단 "AI 코치"가 활성 표시', active.includes('AI 코치'), active);
  await go('#/nutrition');
  const notActive = await page.evaluate(() => [...document.querySelectorAll('header a.active')].map((a) => a.textContent.trim()));
  check('[N4] AI 전용이 아닌 화면(/nutrition)에서는 활성 표시 안 함', !notActive.includes('AI 코치'), notActive);
  check('[R1] 전체 확인 동안 페이지 에러 없음', errors.length === 0, errors);

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  for (const f of failed) console.log(' - ' + f.name);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
