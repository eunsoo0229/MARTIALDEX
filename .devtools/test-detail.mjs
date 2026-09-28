import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/91b22777-cd8e-44fb-a23d-f5efab2e512e/scratchpad/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 1000));

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  async function goto(hash) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise((r) => setTimeout(r, 400));
  }

  async function dump() {
    return page.evaluate(() => {
      const sectionTitles = [...document.querySelectorAll('.info-card h3')].map((el) => el.textContent?.trim());
      const inlinePositionLabel = document.querySelector('.info-card-inline .field-label')?.textContent;
      const positionChips = [...document.querySelectorAll('.info-card-inline .chip')].map((el) => el.textContent?.trim());
      const heroChips = [...document.querySelectorAll('.detail-hero .chip-row > *')].map((el) => el.textContent?.trim());
      const crossArt = [...document.querySelectorAll('.cross-art-badge')].map((el) => el.textContent?.trim());
      const related = [...document.querySelectorAll('.related-link')].map((el) => el.textContent?.trim());
      const tags = [...document.querySelectorAll('.info-card:has(h3) .chip')].map(el=>el.textContent?.trim());
      return { sectionTitles, inlinePositionLabel, positionChips, heroChips, crossArt, related };
    });
  }

  console.log('\n=== bjj Armbar ===');
  await goto('#/arts/bjj/techniques/bjj__armbar');
  console.log(JSON.stringify(await dump(), null, 2));
  await page.screenshot({ path: path.join(SHOT_DIR, 'detail-armbar.png'), fullPage: true });

  console.log('\n=== judo Osoto Gari (cross-art chain test) ===');
  await goto('#/arts/judo/techniques/judo__osoto-gari');
  const d1 = await dump();
  console.log(JSON.stringify(d1, null, 2));
  await page.screenshot({ path: path.join(SHOT_DIR, 'detail-osotogari-judo.png'), fullPage: true });

  console.log('\n=== click first cross-art badge (should jump to another art\'s Osoto Gari) ===');
  const clicked = await page.evaluate(() => {
    const badge = document.querySelector('.cross-art-badge');
    if (!badge) return 'NOT_FOUND';
    badge.click();
    return badge.textContent;
  });
  console.log('clicked badge:', clicked);
  await new Promise((r) => setTimeout(r, 400));
  console.log('new url hash:', await page.evaluate(() => location.hash));
  const d2 = await dump();
  console.log('landed page cross-art matches:', d2.crossArt);
  await page.screenshot({ path: path.join(SHOT_DIR, 'detail-osotogari-chained.png'), fullPage: true });

  console.log('\n=== a technique likely missing many optional fields (check graceful hiding) ===');
  await goto('#/arts/taekwondo/techniques/taekwondo__나란히서기');
  const d3 = await dump();
  console.log(JSON.stringify(d3, null, 2));
  await page.screenshot({ path: path.join(SHOT_DIR, 'detail-sparse.png'), fullPage: true });

  console.log('\n=== mobile width check on Armbar page ===');
  await goto('#/arts/bjj/techniques/bjj__armbar');
  await page.setViewportSize({ width: 375, height: 800 });
  await new Promise((r) => setTimeout(r, 400));
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  console.log('mobile overflow check:', overflow);
  await page.screenshot({ path: path.join(SHOT_DIR, 'detail-mobile.png'), fullPage: true });

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  await app.close();
}

main().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
