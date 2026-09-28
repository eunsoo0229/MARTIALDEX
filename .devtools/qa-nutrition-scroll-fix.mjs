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

// Verifies the fix for: AI 식단 결과(자연어 분석/사진 분석/식단 생성)의 음식
// 리스트가 많을 때 모달이 화면 밖으로 밀려나고 스크롤이 불가능했던 버그.
// The shared root cause lives in MealFormModal.tsx (which both the manual
// "+ 직접 입력" path AND every AI-review path route through) plus the new
// .modal-panel--scrollable/.modal-scroll-body CSS in global.css. Exercised
// here via the manual-entry path only — no live Gemini calls, since the DOM
// structure and CSS are identical regardless of how the modal was opened.
// AiMealGenModal's plan-review step reuses the exact same classes combined
// with .ai-modal — verified separately below via a raw DOM injection so the
// "ai-modal's own overflow-y:auto vs the new scrollable structure" conflict
// is checked without a live API call.
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-scrollfix-'));
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

  // ---- 1. Desktop viewport: open manual meal entry, add many food rows ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await goto('#/nutrition');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ 직접 입력'))?.click();
  });
  await sleep(300);

  const ROW_COUNT = 25;
  for (let i = 0; i < ROW_COUNT - 1; i++) {
    await page.evaluate(() => {
      [...document.querySelectorAll('.modal-panel button')].find((b) => b.textContent.trim() === '+ 음식 추가')?.click();
    });
  }
  await sleep(300);
  const rowCount = await page.evaluate(() => document.querySelectorAll('.modal-scroll-body input[placeholder="음식 이름"]').length);
  check(`[1][준비] 음식 행 ${ROW_COUNT}개 생성됨`, rowCount === ROW_COUNT, `rows=${rowCount}`);

  const desktopMetrics = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel');
    const scrollBody = document.querySelector('.modal-scroll-body');
    const actions = document.querySelector('.modal-actions');
    const panelRect = panel.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      panelHeight: panelRect.height,
      scrollBodyScrollHeight: scrollBody.scrollHeight,
      scrollBodyClientHeight: scrollBody.clientHeight,
      actionsTop: actionsRect.top,
      actionsBottom: actionsRect.bottom,
    };
  });
  check(
    '[2][PC] 모달 패널이 화면 밖으로 밀려나지 않음 (전체 높이가 뷰포트 이내)',
    desktopMetrics.panelTop >= -1 && desktopMetrics.panelBottom <= desktopMetrics.viewportHeight + 1,
    JSON.stringify(desktopMetrics)
  );
  check(
    '[3][PC] 음식 리스트 영역 자체가 독립적으로 스크롤 필요 (scrollHeight > clientHeight)',
    desktopMetrics.scrollBodyScrollHeight > desktopMetrics.scrollBodyClientHeight + 10,
    JSON.stringify(desktopMetrics)
  );
  check(
    '[4][PC] 저장/취소 버튼(고정 영역)이 뷰포트 안에 그대로 보임',
    desktopMetrics.actionsTop >= 0 && desktopMetrics.actionsBottom <= desktopMetrics.viewportHeight,
    JSON.stringify(desktopMetrics)
  );

  // ---- 5. PC 마우스 휠 스크롤이 실제로 동작하는지 ----
  const beforeScrollTop = await page.evaluate(() => document.querySelector('.modal-scroll-body').scrollTop);
  await page.evaluate(() => {
    const el = document.querySelector('.modal-scroll-body');
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10 }));
  });
  // WheelEvent dispatch alone doesn't trigger native scroll in a headless
  // evaluate context, so directly verify the element CAN scroll (the real
  // native-scroll wiring is exercised by mouse.wheel below, which does
  // trigger actual OS-level scrolling in Playwright).
  const panelBox = await page.evaluate(() => {
    const el = document.querySelector('.modal-scroll-body');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(panelBox.x, panelBox.y);
  await page.mouse.wheel(0, 400);
  await sleep(300);
  const afterScrollTop = await page.evaluate(() => document.querySelector('.modal-scroll-body').scrollTop);
  check(
    '[5][PC] 마우스 휠로 음식 리스트가 실제로 스크롤됨',
    afterScrollTop > beforeScrollTop,
    `before=${beforeScrollTop} after=${afterScrollTop}`
  );

  // ---- 6. 고정 영역(제목/식사 종류 chip)은 스크롤해도 그대로 보임 ----
  const headerStillVisible = await page.evaluate(() => {
    const h3 = document.querySelector('.modal-panel h3');
    const rect = h3.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  check('[6][PC] 리스트 스크롤 후에도 제목(고정 영역)은 그대로 보임', headerStillVisible, '');

  // ---- 7. Mobile viewport: same structure, touch-relevant CSS applied ----
  await page.setViewportSize({ width: 375, height: 812 });
  await sleep(300);
  const mobileMetrics = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel');
    const scrollBody = document.querySelector('.modal-scroll-body');
    const actions = document.querySelector('.modal-actions');
    const cs = getComputedStyle(scrollBody);
    const panelRect = panel.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      actionsBottom: actionsRect.bottom,
      overflowY: cs.overflowY,
      minHeight: cs.minHeight,
      touchAction: cs.touchAction,
      overscrollBehaviorY: cs.overscrollBehaviorY || cs.overscrollBehavior,
    };
  });
  check(
    '[7][모바일] 모달이 화면 밖으로 밀려나지 않음',
    mobileMetrics.panelTop >= -1 && mobileMetrics.panelBottom <= mobileMetrics.viewportHeight + 1,
    JSON.stringify(mobileMetrics)
  );
  check('[7b][모바일] 저장 버튼이 화면 안에 보임', mobileMetrics.actionsBottom <= mobileMetrics.viewportHeight, JSON.stringify(mobileMetrics));
  check('[8][모바일] overflow-y:auto 적용됨', mobileMetrics.overflowY === 'auto', JSON.stringify(mobileMetrics));
  check('[8b][모바일] min-height:0 적용됨 (flex 자식이 줄어들 수 있음)', mobileMetrics.minHeight === '0px', JSON.stringify(mobileMetrics));
  check('[8c][모바일] touch-action: pan-y 적용됨 (터치 스크롤 허용)', mobileMetrics.touchAction === 'pan-y', JSON.stringify(mobileMetrics));
  check(
    '[8d][모바일] overscroll-behavior: contain 적용됨 (스크롤 체이닝 방지)',
    mobileMetrics.overscrollBehaviorY === 'contain',
    JSON.stringify(mobileMetrics)
  );

  // ---- 9. 모바일 터치 스크롤(프로그래밍적 scrollTop 변경이 실제로 반영되는지) ----
  const mobileScrollWorks = await page.evaluate(() => {
    const el = document.querySelector('.modal-scroll-body');
    el.scrollTop = 0;
    const before = el.scrollTop;
    el.scrollTop = 150;
    const after = el.scrollTop;
    return { before, after, canScroll: el.scrollHeight > el.clientHeight };
  });
  check(
    '[9][모바일] 리스트가 스크롤 가능한 상태이고 scrollTop 이동이 반영됨',
    mobileScrollWorks.canScroll && mobileScrollWorks.after > mobileScrollWorks.before,
    JSON.stringify(mobileScrollWorks)
  );

  await page.evaluate(() => {
    [...document.querySelectorAll('.modal-panel button')].find((b) => b.textContent.trim() === '취소')?.click();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await sleep(300);

  // ---- 10. 짧은 결과(음식 1개)일 때는 불필요한 스크롤 영역이 생기지 않음 ----
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ 직접 입력'))?.click();
  });
  await sleep(300);
  const shortMetrics = await page.evaluate(() => {
    const scrollBody = document.querySelector('.modal-scroll-body');
    const panel = document.querySelector('.modal-panel');
    return {
      scrollHeight: scrollBody.scrollHeight,
      clientHeight: scrollBody.clientHeight,
      panelHeight: panel.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    };
  });
  check(
    '[10][짧은 결과] 음식 1개일 때 리스트 영역에 불필요한 빈 스크롤 공간이 생기지 않음',
    shortMetrics.scrollHeight - shortMetrics.clientHeight <= 2,
    JSON.stringify(shortMetrics)
  );
  check(
    '[10b][짧은 결과] 모달이 85vh까지 늘어나지 않고 내용 크기만큼만 표시됨',
    shortMetrics.panelHeight < shortMetrics.viewportHeight * 0.85 - 20,
    JSON.stringify(shortMetrics)
  );
  await page.evaluate(() => {
    [...document.querySelectorAll('.modal-panel button')].find((b) => b.textContent.trim() === '취소')?.click();
  });

  // ---- 11. AiMealGenModal의 plan-review 구조 (ai-modal + modal-panel--scrollable 결합) ----
  // Injects the exact class combination AiMealGenModal.tsx uses in review
  // mode, with a long synthetic food list, to verify .ai-modal's own
  // overflow-y:auto is correctly overridden by .modal-panel--scrollable
  // (the "부모/자식 overflow 충돌" the task explicitly asked to check for),
  // without making a live Gemini call.
  const aiModalCheck = await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-panel ai-modal modal-panel--scrollable" id="qa-ai-modal">
        <h3>QA 제목</h3>
        <div class="modal-scroll-body" id="qa-scroll-body">
          ${Array.from({ length: 40 }, (_, i) => `<div style="height:40px">음식 ${i}</div>`).join('')}
        </div>
        <div class="modal-actions" id="qa-actions"><button class="btn btn-primary">저장</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const panel = document.getElementById('qa-ai-modal');
    const scrollBody = document.getElementById('qa-scroll-body');
    const actions = document.getElementById('qa-actions');
    const panelStyle = getComputedStyle(panel);
    const scrollBodyStyle = getComputedStyle(scrollBody);
    const result = {
      panelOverflowY: panelStyle.overflowY,
      scrollBodyOverflowY: scrollBodyStyle.overflowY,
      panelWithinViewport: panel.getBoundingClientRect().bottom <= window.innerHeight + 1,
      actionsWithinViewport: actions.getBoundingClientRect().bottom <= window.innerHeight,
      scrollBodyScrollable: scrollBody.scrollHeight > scrollBody.clientHeight,
    };
    overlay.remove();
    return result;
  });
  check(
    '[11][ai-modal 결합] 패널 자체 overflow-y는 hidden (ai-modal의 auto를 오버라이드)',
    aiModalCheck.panelOverflowY === 'hidden',
    JSON.stringify(aiModalCheck)
  );
  check('[11b][ai-modal 결합] 내부 스크롤 영역만 overflow-y:auto', aiModalCheck.scrollBodyOverflowY === 'auto', JSON.stringify(aiModalCheck));
  check('[11c][ai-modal 결합] 패널이 뷰포트 안에 유지됨', aiModalCheck.panelWithinViewport, JSON.stringify(aiModalCheck));
  check('[11d][ai-modal 결합] 저장 버튼이 뷰포트 안에 보임(고정 영역)', aiModalCheck.actionsWithinViewport, JSON.stringify(aiModalCheck));
  check('[11e][ai-modal 결합] 내부 리스트가 실제로 스크롤 필요 상태', aiModalCheck.scrollBodyScrollable, JSON.stringify(aiModalCheck));

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
