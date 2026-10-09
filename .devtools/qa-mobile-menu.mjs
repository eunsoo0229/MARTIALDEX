import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-qa-'))}`], env: cleanEnv, timeout: 120000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));

  // 375px — a typical real phone's CSS viewport width in portrait.
  await page.setViewportSize({ width: 375, height: 812 });
  await new Promise((r) => setTimeout(r, 300));

  const navLinksHidden = await page.evaluate(() => {
    const el = document.querySelector('.nav-links');
    return el ? getComputedStyle(el).display === 'none' : null;
  });
  check('[375px] .nav-links is hidden (as designed)', navLinksHidden === true, String(navLinksHidden));

  const menuBtnVisible = await page.evaluate(() => {
    const el = document.querySelector('.mobile-menu-btn');
    return el ? getComputedStyle(el).display !== 'none' : null;
  });
  check('[375px] mobile menu button (☰) is visible', menuBtnVisible === true, String(menuBtnVisible));

  await page.click('.mobile-menu-btn');
  await new Promise((r) => setTimeout(r, 200));
  const panelLinks = await page.evaluate(() => [...document.querySelectorAll('.mobile-menu-panel a')].map((a) => a.textContent.trim()));
  // Was 22, then 28, then 37, then 38 (스파링 촬영); back to 37 after
  // removing AI 쉐도우 복싱 from the 훈련 group; 38 again with 배운 기술 (무술
  // group) — this count will keep drifting as features are added; update it
  // here when it does.
  check('[375px] menu panel lists all current destinations (38, incl. 스파링 촬영 + 배운 기술)', panelLinks.length === 38, JSON.stringify(panelLinks));
  check('[375px] "프로필" (previously unreachable on mobile) is in the menu', panelLinks.includes('프로필'));
  check('[375px] "커뮤니티" (previously unreachable on mobile) is in the menu', panelLinks.includes('커뮤니티'));

  await page.click('.mobile-menu-panel a:has-text("커뮤니티")');
  await new Promise((r) => setTimeout(r, 500));
  const url = await page.evaluate(() => location.href);
  check('[375px] clicking a menu item navigates', url.includes('/community'), url);
  const panelClosedAfterNav = await page.evaluate(() => !document.querySelector('.mobile-menu-panel'));
  check('[375px] panel closes after navigating', panelClosedAfterNav);

  await page.evaluate(() => { location.hash = '#/'; });
  await new Promise((r) => setTimeout(r, 400));
  const aiBtnVisible = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.title === 'AI에게 질문');
    return btn ? getComputedStyle(btn).display !== 'none' : null;
  });
  check('[375px] AI ask (✦) button still present (not removed)', aiBtnVisible === true, String(aiBtnVisible));

  // Desktop viewport must stay exactly as before.
  await page.setViewportSize({ width: 1280, height: 860 });
  await new Promise((r) => setTimeout(r, 300));
  const desktopMenuBtnHidden = await page.evaluate(() => {
    const el = document.querySelector('.mobile-menu-btn');
    return el ? getComputedStyle(el).display === 'none' : null;
  });
  check('[1280px desktop] mobile menu button stays hidden', desktopMenuBtnHidden === true, String(desktopMenuBtnHidden));
  const desktopNavLinksVisible = await page.evaluate(() => {
    const el = document.querySelector('.nav-links');
    return el ? getComputedStyle(el).display !== 'none' : null;
  });
  check('[1280px desktop] .nav-links (with 메뉴 dropdown) still visible', desktopNavLinksVisible === true, String(desktopNavLinksVisible));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
