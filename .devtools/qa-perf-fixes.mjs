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

// Verifies the two reported bugs live:
// 1. AiAskModal opened from Header.tsx used to render squeezed into the
//    header's own 64px box (backdrop-filter on .site-header creates a new
//    containing block for position:fixed descendants) — fixed via a
//    createPortal(..., document.body) in AiAskModal.tsx.
// 2. SearchBar/TechniqueList typing lag — fixed by debouncing the value
//    that drives searchAllTechniques (measured 40-220ms/call) instead of
//    recomputing it synchronously on every keystroke.
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-perf-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith('http://localhost:5173'));
    if (!page) await sleep(300);
  }
  if (!page) page = await app.firstWindow();
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await sleep(500);
  }

  // ---- 1. AI 질문 — Home 화면에서 열었을 때 (PC) ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await goto('#/');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('AI에게 기술 질문하기'))?.click();
  });
  await sleep(300);
  const homeModalMetrics = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel.ai-modal');
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, viewportHeight: window.innerHeight };
  });
  check(
    '[1][PC] Home 화면에서 연 AI 질문 모달이 화면 안에 정상 표시됨',
    !!homeModalMetrics && homeModalMetrics.top >= 0 && homeModalMetrics.bottom <= homeModalMetrics.viewportHeight,
    JSON.stringify(homeModalMetrics)
  );
  await page.evaluate(() => {
    [...document.querySelectorAll('.modal-panel button')].find((b) => b.textContent.trim() === '닫기')?.click();
  });
  await sleep(300);

  // ---- 2. AI 질문 — Header 버튼으로 열었을 때 (PC) — 이게 실제 버그 지점 ----
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.title === 'AI에게 질문')?.click();
  });
  await sleep(300);
  const headerModalMetrics = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel.ai-modal');
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    const overlay = document.querySelector('.modal-overlay');
    const overlayR = overlay.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      height: r.height,
      viewportHeight: window.innerHeight,
      overlayTop: overlayR.top,
      overlayBottom: overlayR.bottom,
      overlayHeight: overlayR.height,
      portaledToBody: overlay.parentElement === document.body,
    };
  });
  check(
    '[2][PC] Header 버튼으로 연 AI 질문 모달이 화면 안에 정상 표시됨 (더 이상 헤더 박스로 찌그러지지 않음)',
    !!headerModalMetrics && headerModalMetrics.top >= 0 && headerModalMetrics.bottom <= headerModalMetrics.viewportHeight,
    JSON.stringify(headerModalMetrics)
  );
  check(
    '[2b][PC] 오버레이가 헤더의 64px 박스가 아니라 뷰포트 전체를 덮음',
    !!headerModalMetrics && headerModalMetrics.overlayHeight > 200,
    JSON.stringify(headerModalMetrics)
  );
  check('[2c] 모달이 document.body로 포탈링됨 (Header의 backdrop-filter 영향 없음)', !!headerModalMetrics?.portaledToBody, '');
  check(
    '[3] Home과 Header 두 경우 모두 동일한 위치/크기로 렌더링됨',
    !!homeModalMetrics && !!headerModalMetrics && Math.abs(homeModalMetrics.height - headerModalMetrics.height) < 2,
    JSON.stringify({ home: homeModalMetrics, header: headerModalMetrics })
  );

  // ---- 4. 모바일 viewport에서도 확인 ----
  await page.evaluate(() => {
    [...document.querySelectorAll('.modal-panel button')].find((b) => b.textContent.trim() === '닫기')?.click();
  });
  await sleep(300);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.title === 'AI에게 질문')?.click();
  });
  await sleep(300);
  const mobileModalMetrics = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel.ai-modal');
    const r = panel.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, viewportHeight: window.innerHeight };
  });
  check(
    '[4][모바일] Header AI 질문 모달이 화면 안에 정상 표시됨',
    mobileModalMetrics.top >= 0 && mobileModalMetrics.bottom <= mobileModalMetrics.viewportHeight,
    JSON.stringify(mobileModalMetrics)
  );

  // ---- 5. 긴 응답에서 내부 스크롤 확인 (.ai-chat) ----
  const scrollCheck = await page.evaluate(() => {
    const chat = document.querySelector('.ai-chat');
    const cs = getComputedStyle(chat);
    return { overflowY: cs.overflowY, maxHeight: cs.maxHeight };
  });
  check('[5] AI 모달 내부 대화 영역이 독립적으로 스크롤 가능 (overflow-y:auto)', scrollCheck.overflowY === 'auto', JSON.stringify(scrollCheck));

  await page.evaluate(() => {
    [...document.querySelectorAll('.modal-panel button')].find((b) => b.textContent.trim() === '닫기')?.click();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await sleep(300);

  // ---- 6. 기술 검색 — 입력 즉시 UI 반응 (PC) ----
  await goto('#/');
  const heroInput = await page.$('.hero__search-wrap input');
  const t0 = Date.now();
  await heroInput.type('armb', { delay: 20 });
  const typeMs = Date.now() - t0;
  check('[6] 홈 검색창에 4글자 입력이 빠르게 완료됨 (블로킹 없음)', typeMs < 500, `typeMs=${typeMs}`);
  const inputValueRightAfterTyping = await heroInput.inputValue();
  check('[6b] 입력한 글자가 즉시 입력창에 반영됨', inputValueRightAfterTyping === 'armb', inputValueRightAfterTyping);

  await sleep(400); // past the 150ms debounce
  const bodyAfterSearch = await page.evaluate(() => document.body.innerText);
  check('[7] 디바운스 이후 정확한 검색 결과 표시 (Armbar)', bodyAfterSearch.includes('Armbar'), '');

  // ---- 8. 한글 검색 정확성 ----
  await heroInput.fill('');
  await sleep(200);
  await heroInput.type('암바', { delay: 20 });
  await sleep(400);
  const bodyAfterKorean = await page.evaluate(() => document.body.innerText);
  check('[8] 한글 검색("암바") 결과가 정확히 표시됨', /Armbar|암바/.test(bodyAfterKorean), '');

  // ---- 9. 검색어 삭제 후 재입력 ----
  await heroInput.fill('');
  await sleep(300);
  const emptyPanelVisible = await page.evaluate(() => !!document.querySelector('.search-results-panel'));
  check('[9] 검색어 삭제 시 결과 패널이 사라짐', !emptyPanelVisible, '');
  await heroInput.type('kimura', { delay: 15 });
  await sleep(400);
  const bodyAfterRetype = await page.evaluate(() => document.body.innerText);
  check('[9b] 재입력 후 정확한 검색 결과 표시 (Kimura)', bodyAfterRetype.includes('Kimura'), '');

  // ---- 10. TechniqueList.tsx 검색창도 동일하게 확인 ----
  await goto('#/techniques');
  const listInput = await page.$('input[placeholder="기술 이름, 한글명, 태그로 검색..."]');
  const t1 = Date.now();
  await listInput.type('choke', { delay: 20 });
  const listTypeMs = Date.now() - t1;
  check('[10] 전체 기술 검색 페이지 입력도 빠르게 완료됨', listTypeMs < 500, `typeMs=${listTypeMs}`);
  await sleep(400);
  const listBody = await page.evaluate(() => document.body.innerText);
  check('[10b] URL도 디바운스 이후 정확히 동기화됨', (await page.evaluate(() => location.hash)).includes('q=choke'), await page.evaluate(() => location.hash));
  check('[10c] 검색 결과 정확함 (Choke 포함)', /[Cc]hoke/.test(listBody), '');

  // ---- 11. 모바일 viewport에서 검색 ----
  await page.setViewportSize({ width: 375, height: 812 });
  await goto('#/');
  const mobileHeroInput = await page.$('.hero__search-wrap input');
  await mobileHeroInput.type('jab', { delay: 20 });
  await sleep(400);
  const mobileSearchBody = await page.evaluate(() => document.body.innerText);
  check('[11][모바일] 홈 검색 결과 정상 표시', /Jab/.test(mobileSearchBody), '');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('[11b][모바일] 가로 스크롤 없음', overflow <= 1, `overflow=${overflow}px`);
  await page.setViewportSize({ width: 1280, height: 900 });

  check('[규약] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed < results.length) {
    console.log('FAILURES:');
    for (const r of results) if (!r.pass) console.log(' - ' + r.name + ' :: ' + r.detail);
  }

  await app.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
