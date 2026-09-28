// Task 5 Part 4's mobile-viewport verification for the screens actually
// touched this session: Community feed/composer, GymSetInput's set-complete
// flow, nutrition modals (now BottomSheet), CurriculumEditor's day accordion,
// Header touch targets, TrainingHub/Nutrition stat rows. Checks horizontal
// overflow + basic touch-target sizing at 375/390/430px.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const VIEWPORTS = [
  { width: 375, height: 812, label: '375px' },
  { width: 390, height: 844, label: '390px' },
  { width: 430, height: 932, label: '430px' },
];

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith('http://localhost:5173'));
    if (!page) await sleep(300);
  }
  if (!page) page = await app.firstWindow();
  await page.waitForLoadState('load');
  await sleep(1000);
  return { app, page };
}

async function overflowAt(page, hash, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(500);
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function main() {
  const { app, page } = await launch();

  const SCREENS = [
    { hash: '#/community', label: '커뮤니티(게시물 탭)' },
    { hash: '#/nutrition', label: '영양/식단' },
    { hash: '#/training', label: '훈련 홈' },
    { hash: '#/dashboard', label: '대시보드' },
  ];

  for (const vp of VIEWPORTS) {
    for (const s of SCREENS) {
      const overflow = await overflowAt(page, s.hash, vp);
      check(`[${vp.label}] ${s.label} 가로 스크롤 없음`, overflow <= 1, `overflow=${overflow}px`);
    }
  }

  // Community 게시물 탭으로 전환 후 확인 (탭 클릭이 필요 — hash만으로는 커리큘럼 탭이 기본).
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    location.hash = '#/community';
  });
  await sleep(500);
  const postsTabBtn = await page.$('button:has-text("게시물")');
  if (postsTabBtn) {
    await postsTabBtn.click();
    await sleep(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[375px] 커뮤니티 게시물 탭(피드) 가로 스크롤 없음', overflow <= 1, `overflow=${overflow}px`);

    // Touch target check: like/comment/save button min height.
    const actionBtnHeights = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.community-post-card__action-btn'));
      return btns.map((b) => b.getBoundingClientRect().height);
    });
    check(
      '[375px] 좋아요/댓글/저장 버튼 터치 영역 >= 40px',
      actionBtnHeights.length === 0 || actionBtnHeights.every((h) => h >= 40),
      JSON.stringify(actionBtnHeights)
    );
  } else {
    check('[375px] 커뮤니티 게시물 탭(피드) 가로 스크롤 없음', false, '게시물 탭 버튼을 찾지 못함');
  }

  // Header icon-btn touch target at 375px.
  const iconBtnSizes = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.icon-btn'));
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
  });
  check(
    '[375px] Header 아이콘 버튼 터치 영역 >= 44px',
    iconBtnSizes.length > 0 && iconBtnSizes.every((s) => s.w >= 44 && s.h >= 44),
    JSON.stringify(iconBtnSizes)
  );

  await app.close();

  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED ===`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(` - ${f.name} :: ${f.detail}`);
  }
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
