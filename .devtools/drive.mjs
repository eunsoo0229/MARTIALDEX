import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/91b22777-cd8e-44fb-a23d-f5efab2e512e/scratchpad/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(
  APP_DIR,
  'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
);

const logs = [];
function log(...args) {
  console.log(...args);
  logs.push(args.join(' '));
}

async function main() {
  // Launch with a clean env: strip ELECTRON_RUN_AS_NODE so the binary boots
  // as a real Electron app instead of a plain Node CLI.
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    executablePath: electronBin,
    args: [APP_DIR],
    env: cleanEnv,
    timeout: 30_000,
  });

  log('launched. windows:', app.windows().length);
  for (const w of app.windows()) log(' window url:', w.url());
  const page =
    app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ??
    (await app.firstWindow());
  log('using page url:', page.url());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 1200));

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  async function shot(name) {
    const f = path.join(SHOT_DIR, name + '.png');
    await page.screenshot({ path: f });
    log('screenshot:', f);
  }

  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }

  // ---- 1. Home ----
  log('\n=== 1. HOME ===');
  log('title text:', await textOf('.hero__logo'));
  const cardCount = await page.evaluate(() => document.querySelectorAll('.art-card').length);
  log('martial art cards on home:', cardCount);
  const firstCardName = await textOf('.art-card__name-ko');
  log('first card name:', firstCardName);
  await shot('01-home');

  // ---- click a martial art card -> Martial Art Detail ----
  log('\n=== 2. CLICK MARTIAL ART CARD -> DETAIL ===');
  const clickResult = await page.evaluate(() => {
    const card = document.querySelector('.art-card');
    if (!card) return 'NOT_FOUND';
    card.click();
    return 'OK';
  });
  log('click .art-card ->', clickResult);
  await new Promise((r) => setTimeout(r, 500));
  log('url hash after click:', await page.evaluate(() => location.hash));
  log('detail h1:', await textOf('.detail-hero h1'));
  await shot('02-martial-art-detail');

  // ---- go to Martial Arts List page directly ----
  log('\n=== 3. MARTIAL ARTS LIST (/arts) ===');
  await page.evaluate(() => {
    location.hash = '#/arts';
  });
  await new Promise((r) => setTimeout(r, 500));
  const listCardCount = await page.evaluate(() => document.querySelectorAll('.art-card').length);
  log('cards on /arts:', listCardCount);
  log('heading:', await textOf('.section-title h2'));
  await shot('03-martial-arts-list');

  // ---- go into a specific known martial art detail (bjj) ----
  log('\n=== 4. MARTIAL ART DETAIL (/arts/bjj) ===');
  await page.evaluate(() => {
    location.hash = '#/arts/bjj';
  });
  await new Promise((r) => setTimeout(r, 500));
  log('h1:', await textOf('.detail-hero h1'));
  const categoryChipCount = await page.evaluate(
    () => document.querySelectorAll('.chip-row a.chip').length
  );
  log('category chips:', categoryChipCount);
  const previewRowCount = await page.evaluate(
    () => document.querySelectorAll('.technique-row').length
  );
  log('preview technique rows:', previewRowCount);
  await shot('04-bjj-detail');

  // ---- click "전체 기술 보기" -> Technique List ----
  log('\n=== 5. CLICK "전체 기술 보기" -> TECHNIQUE LIST ===');
  const goListResult = await page.evaluate(() => {
    const els = [...document.querySelectorAll('a, button')];
    const el = els.find((e) => e.textContent?.includes('전체 기술 보기'));
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'OK';
  });
  log('click 전체 기술 보기 ->', goListResult);
  await new Promise((r) => setTimeout(r, 500));
  log('url hash:', await page.evaluate(() => location.hash));
  const rowCount = await page.evaluate(() => document.querySelectorAll('.technique-row').length);
  log('technique rows on list page:', rowCount);
  log('result count text:', await textOf('.result-count'));
  await shot('05-technique-list');

  // ---- filter by category select ----
  log('\n=== 5b. FILTER BY CATEGORY ===');
  const categoryFilterResult = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select.select')];
    const catSelect = selects[0];
    if (!catSelect || catSelect.options.length < 2) return 'NO_OPTIONS';
    catSelect.value = catSelect.options[1].value;
    catSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return catSelect.options[1].value;
  });
  log('selected category ->', categoryFilterResult);
  await new Promise((r) => setTimeout(r, 400));
  log('result count after filter:', await textOf('.result-count'));
  await shot('05b-technique-list-filtered');
  // clear filter for the next step
  await page.evaluate(() => {
    location.hash = '#/arts/bjj/techniques';
  });
  await new Promise((r) => setTimeout(r, 400));

  // ---- click first technique row -> Technique Detail ----
  log('\n=== 6. CLICK TECHNIQUE ROW -> TECHNIQUE DETAIL ===');
  const firstRowName = await textOf('.technique-row__name');
  log('first technique row name:', firstRowName);
  const rowClickResult = await page.evaluate(() => {
    const row = document.querySelector('.technique-row');
    if (!row) return 'NOT_FOUND';
    row.click();
    return 'OK';
  });
  log('click .technique-row ->', rowClickResult);
  await new Promise((r) => setTimeout(r, 500));
  log('url hash:', await page.evaluate(() => location.hash));
  log('detail h1:', await textOf('.detail-hero h1'));
  log('description present:', (await textOf('.info-card p')) !== null);
  const relatedCount = await page.evaluate(
    () => document.querySelectorAll('.related-link').length
  );
  log('related technique links:', relatedCount);
  await shot('06-technique-detail');

  // ---- favorite toggle ----
  log('\n=== 7. FAVORITE TOGGLE ===');
  const favResult = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('즐겨찾기')
    );
    if (!btn) return 'NOT_FOUND';
    const before = btn.textContent;
    btn.click();
    return before + ' -> ' + btn.textContent;
  });
  log('favorite button toggle:', favResult);

  // ---- go home, check recently viewed + favorites populated ----
  log('\n=== 8. BACK TO HOME: recently viewed + favorites ===');
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await new Promise((r) => setTimeout(r, 500));
  const recentRows = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('section')];
    const recentSection = sections.find((s) => s.querySelector('h2')?.textContent === '최근 본 기술');
    return recentSection ? recentSection.querySelectorAll('.technique-row').length : -1;
  });
  const favRows = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('section')];
    const favSection = sections.find((s) => s.querySelector('h2')?.textContent === '즐겨찾기');
    return favSection ? favSection.querySelectorAll('.technique-row').length : -1;
  });
  log('recently-viewed rows on home:', recentRows);
  log('favorite rows on home:', favRows);
  await shot('07-home-with-history');

  // ---- global search ----
  log('\n=== 9. GLOBAL SEARCH ===');
  await page.evaluate(() => {
    const input = document.querySelector('.search-box--hero input');
    input.focus();
  });
  await page.keyboard.type('Armbar', { delay: 30 });
  await new Promise((r) => setTimeout(r, 400));
  const searchResultCount = await page.evaluate(
    () => document.querySelectorAll('.search-result-row').length
  );
  log('search result rows for "Armbar":', searchResultCount);
  await shot('08-search-results');

  // ---- AI ask modal ----
  log('\n=== 10. AI ASK MODAL ===');
  const aiOpenResult = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('AI에게')
    );
    if (!btn) return 'NOT_FOUND';
    btn.click();
    return 'OK';
  });
  log('open AI modal ->', aiOpenResult);
  await new Promise((r) => setTimeout(r, 300));
  log('modal visible:', await page.evaluate(() => !!document.querySelector('.modal-overlay')));
  await shot('09-ai-modal');

  log('\n=== CONSOLE ERRORS CAPTURED ===');
  log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  fs.writeFileSync(
    '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/91b22777-cd8e-44fb-a23d-f5efab2e512e/scratchpad/drive-log.txt',
    logs.join('\n')
  );

  await app.close();
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
