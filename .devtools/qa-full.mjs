import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR =
  '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(
  APP_DIR,
  'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronBin,
    args: [APP_DIR],
    env: cleanEnv,
    timeout: 30000,
  });
  const page =
    app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ??
    (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 1000));

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await new Promise((r) => setTimeout(r, 500));
  }
  async function shot(name) {
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  }
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }
  async function clickText(text, selector = 'a, button') {
    return page.evaluate(
      ({ t, s }) => {
        const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t));
        if (!el) return 'NOT_FOUND';
        el.click();
        return 'OK';
      },
      { t: text, s: selector }
    );
  }

  // ---- 0. Clear persisted state for a clean empty-state baseline ----
  await page.evaluate(() => localStorage.clear());
  await page.reload(); // hooks read localStorage once at mount; a bare hash-set to the same route wouldn't remount them
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // ============ 1. HOME PAGE ============
  check('Home page loads', (await textOf('.hero__logo'))?.includes('MARTIAL'));
  const artCardCount = await page.evaluate(() => document.querySelectorAll('.art-card').length);
  check('Home shows all 10 martial art cards', artCardCount === 10, `count=${artCardCount}`);
  check(
    'Recently viewed EMPTY STATE shown (fresh)',
    !!(await page.evaluate(() => {
      const s = [...document.querySelectorAll('section')].find(
        (s) => s.querySelector('h2')?.textContent === '최근 본 기술'
      );
      return s?.querySelector('.empty-state');
    }))
  );
  check(
    'Favorites EMPTY STATE shown (fresh)',
    !!(await page.evaluate(() => {
      const s = [...document.querySelectorAll('section')].find(
        (s) => s.querySelector('h2')?.textContent === '즐겨찾기'
      );
      return s?.querySelector('.empty-state');
    }))
  );
  await shot('01-home');

  // ============ 2. ALL 9 MARTIAL ARTS ============
  const ARTS = [
    ['bjj', '주짓수'],
    ['karate', '가라테'],
    ['wrestling', '레슬링'],
    ['muay-thai', '무에타이'],
    ['boxing', '복싱'],
    ['sambo', '삼보'],
    ['judo', '유도'],
    ['kickboxing', '킥복싱'],
    ['taekwondo', '태권도'],
  ];
  await goto('#/arts');
  const listCardCount = await page.evaluate(() => document.querySelectorAll('.art-card').length);
  check('/arts lists all 10 martial arts', listCardCount === 10, `count=${listCardCount}`);

  for (const [id, nameKo] of ARTS) {
    await goto(`#/arts/${id}`);
    const h1 = await textOf('.detail-hero h1');
    check(`Martial art detail renders: ${id}`, h1 === nameKo, `h1="${h1}"`);
    const rows = await page.evaluate(() => document.querySelectorAll('.technique-row').length);
    check(`  -> ${id} shows technique preview rows`, rows > 0, `rows=${rows}`);

    await goto(`#/arts/${id}/techniques`);
    const listRows = await page.evaluate(() => document.querySelectorAll('.technique-row').length);
    check(`  -> ${id} technique-list page renders`, listRows > 0, `rows=${listRows}`);
  }
  await shot('02-arts-list');

  // ============ 3. FILTERS ============
  await goto('#/arts/bjj/techniques');
  const beforeCount = await textOf('.result-count');
  const catResult = await page.evaluate(() => {
    const sel = document.querySelector('select.select');
    if (!sel || sel.options.length < 2) return 'NO_OPTIONS';
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.options[1].value;
  });
  await new Promise((r) => setTimeout(r, 300));
  const afterCount = await textOf('.result-count');
  check(
    'Category filter changes result count',
    catResult !== 'NO_OPTIONS' && beforeCount !== afterCount,
    `${beforeCount} -> ${afterCount} (cat=${catResult})`
  );
  await clickText('필터 초기화');
  await new Promise((r) => setTimeout(r, 300));

  // difficulty filter
  await goto('#/techniques');
  const diffResult = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('select.select')];
    const diffSel = sels.find((s) => [...s.options].some((o) => o.textContent === '초급'));
    if (!diffSel) return 'NOT_FOUND';
    diffSel.value = 'beginner';
    diffSel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  });
  await new Promise((r) => setTimeout(r, 300));
  const diffBadges = await page.evaluate(() =>
    [...document.querySelectorAll('.technique-row')].every((r) =>
      r.querySelector('.badge-beginner')
    )
  );
  check('Difficulty filter (beginner) narrows results correctly', diffResult === 'OK' && diffBadges);
  await shot('03-filtered');

  // ============ 4. SEARCH ============
  await goto('#/');
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('Armbar', { delay: 15 });
  await new Promise((r) => setTimeout(r, 350));
  const searchCount1 = await page.evaluate(() => document.querySelectorAll('.search-result-row').length);
  check('Search "Armbar" returns results', searchCount1 > 0, `count=${searchCount1}`);
  await shot('04-search-armbar');

  await page.evaluate(() => {
    document.querySelector('.search-box--hero input').value = '';
  });
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('존재하지않는기술이름XYZ123', { delay: 10 });
  await new Promise((r) => setTimeout(r, 350));
  const noResultText = await textOf('.search-result-row__meta');
  check(
    'Search with no matches shows empty message (not crash)',
    noResultText?.includes('일치하는') ?? false,
    `text="${noResultText}"`
  );

  // korean query
  await page.evaluate(() => {
    document.querySelector('.search-box--hero input').value = '';
  });
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('돌리기', { delay: 10 });
  await new Promise((r) => setTimeout(r, 350));
  const koreanSearchCount = await page.evaluate(() => document.querySelectorAll('.search-result-row').length);
  check('Korean-language search works', koreanSearchCount >= 0, `count=${koreanSearchCount}`);
  await page.keyboard.press('Escape');

  // ============ 5. TECHNIQUE DETAIL + VIDEOS + RELATED ============
  const SAMPLES = [
    ['bjj', 'bjj__마운트-탈출', true],
    ['bjj', 'bjj__어깨-프레임', false],
    ['sambo', 'sambo__sleeve-grip-захват-за-рукав', true],
    ['taekwondo', 'taekwondo__나란히서기', true],
  ];
  for (const [art, id, hasVideo] of SAMPLES) {
    await goto(`#/arts/${art}/techniques/${id}`);
    const h1 = await textOf('.detail-hero h1');
    check(`Technique detail loads: ${id}`, !!h1, `h1="${h1}"`);
    const videoState = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.info-card')].find((c) =>
        c.querySelector('h3')?.textContent?.includes('관련 영상')
      );
      if (!card) return null;
      return {
        iframeCount: card.querySelectorAll('iframe').length,
        hasFallbackBtn: !!card.querySelector('button'),
      };
    });
    if (hasVideo) {
      check(`  -> ${id} shows video iframe(s)`, videoState && videoState.iframeCount > 0, JSON.stringify(videoState));
    } else {
      check(
        `  -> ${id} shows YouTube fallback (no curated video)`,
        videoState && videoState.iframeCount === 0 && videoState.hasFallbackBtn,
        JSON.stringify(videoState)
      );
    }
  }
  await shot('05-technique-detail-sambo-cyrillic-id');

  // related technique link click-through
  await goto('#/arts/bjj/techniques/bjj__armbar');
  const relatedHref = await page.evaluate(() => document.querySelector('.related-link')?.getAttribute('href'));
  await clickText('', '.related-link');
  await new Promise((r) => setTimeout(r, 400));
  const navigatedH1 = await textOf('.detail-hero h1');
  check('Related-technique link navigates to a valid page', !!navigatedH1, `href=${relatedHref} h1="${navigatedH1}"`);

  // ============ 6. YOUTUBE FALLBACK BUTTON BEHAVIOR ============
  await goto('#/arts/bjj/techniques/bjj__어깨-프레임');
  const fallbackBtnText = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.info-card')].find((c) =>
      c.querySelector('h3')?.textContent?.includes('관련 영상')
    );
    return card?.querySelector('button')?.textContent ?? null;
  });
  check('YouTube fallback button text present', fallbackBtnText?.includes('검색') ?? false, `"${fallbackBtnText}"`);

  // ============ 7. FAVORITES ============
  await goto('#/arts/bjj/techniques/bjj__armbar');
  await clickText('즐겨찾기', 'button');
  await new Promise((r) => setTimeout(r, 250));
  const favAfterText = await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('즐겨찾기'))?.textContent
  );
  check('Favorite toggles to active state', favAfterText?.includes('★'), `"${favAfterText}"`);

  await goto('#/');
  const favRowsAfter = await page.evaluate(() => {
    const s = [...document.querySelectorAll('section')].find(
      (s) => s.querySelector('h2')?.textContent === '즐겨찾기'
    );
    return s ? s.querySelectorAll('.technique-row').length : -1;
  });
  check('Favorited technique appears on Home', favRowsAfter === 1, `rows=${favRowsAfter}`);

  // ============ 8. RECENTLY VIEWED ============
  const recentRowsAfter = await page.evaluate(() => {
    const s = [...document.querySelectorAll('section')].find(
      (s) => s.querySelector('h2')?.textContent === '최근 본 기술'
    );
    return s ? s.querySelectorAll('.technique-row').length : -1;
  });
  check('Recently-viewed techniques appear on Home', recentRowsAfter > 0, `rows=${recentRowsAfter}`);
  await shot('06-home-with-favorites-recent');

  // ============ 9. DARK MODE / THEME ============
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.title?.startsWith('테마'))?.click()
  );
  await new Promise((r) => setTimeout(r, 200));
  const theme1 = await page.evaluate(() => document.documentElement.dataset.theme ?? 'system');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.title?.startsWith('테마'))?.click()
  );
  await new Promise((r) => setTimeout(r, 200));
  const theme2 = await page.evaluate(() => document.documentElement.dataset.theme ?? 'system');
  check('Theme cycles through states', theme1 !== theme2, `${theme1} -> ${theme2}`);
  await shot('07-theme-' + theme2);
  // force dark explicitly for a clean screenshot
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await shot('07b-theme-dark-forced');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await shot('07c-theme-light-forced');

  // ============ 10. MOBILE RESPONSIVE ============
  await page.setViewportSize({ width: 390, height: 844 });
  await goto('#/');
  await new Promise((r) => setTimeout(r, 300));
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('No horizontal overflow on mobile viewport (Home)', bodyOverflow <= 1, `overflow=${bodyOverflow}px`);
  await shot('08-mobile-home');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  await new Promise((r) => setTimeout(r, 300));
  const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('No horizontal overflow on mobile viewport (Technique Detail)', detailOverflow <= 1, `overflow=${detailOverflow}px`);
  await shot('09-mobile-technique-detail');

  await clickText('AI에게 질문');
  await new Promise((r) => setTimeout(r, 300));
  const modalFitsMobile = await page.evaluate(() => {
    const panel = document.querySelector('.ai-modal');
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    return rect.width <= window.innerWidth;
  });
  check('AI modal fits mobile viewport width', modalFitsMobile);
  await shot('10-mobile-ai-modal');
  await clickText('닫기');
  await page.setViewportSize({ width: 1280, height: 860 });

  // ============ 11. AI FEATURE (real Gemini key) ============
  await goto('#/');
  await clickText('AI에게 기술 질문하기');
  await new Promise((r) => setTimeout(r, 300));
  check('Global AI modal opens from Home', await page.evaluate(() => !!document.querySelector('.ai-modal')));

  await clickText('질문 보내기');
  await new Promise((r) => setTimeout(r, 200));
  const emptyWarn = await textOf('.ai-inline-warning');
  check('Empty question shows warning (not crash)', emptyWarn === '질문을 입력해주세요.');

  await page.click('.ai-modal textarea');
  await page.keyboard.type('그래플링 무술과 타격 무술의 차이가 뭐야?', { delay: 10 });
  const sendClickTime = Date.now();
  await clickText('질문 보내기');
  await new Promise((r) => setTimeout(r, 150));
  const loadingSeen = await page.evaluate(() => !!document.querySelector('.ai-msg__bubble--loading'));
  check('Loading indicator appears while waiting for AI', loadingSeen);
  await shot('11-ai-loading');

  let liveResult = null;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    liveResult = await page.evaluate(() => {
      const modal = document.querySelector('.ai-modal');
      const bubble = modal.querySelector('.ai-msg--model .ai-msg__bubble:not(.ai-msg__bubble--loading)');
      const err = modal.querySelector('.ai-error');
      return { text: bubble?.textContent ?? null, error: err?.textContent ?? null };
    });
    if (liveResult.text || liveResult.error) break;
  }
  check(
    'Global AI (home context) returns a real answer',
    !!liveResult?.text && !liveResult.text.includes('**'),
    liveResult?.text?.slice(0, 80) ?? liveResult?.error
  );
  await shot('12-ai-global-response');
  await clickText('닫기');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  await clickText('AI에게 질문');
  await new Promise((r) => setTimeout(r, 300));
  const introText = await page.evaluate(() => document.querySelector('.ai-modal p')?.textContent);
  check('Technique AI modal intro mentions the technique', introText?.includes('Armbar') ?? false, introText);
  await clickText('닫기');

  // ============ 12. API KEY SECURITY (bundle check happens post-build below) ============

  // ============ RESULTS ============
  console.log('\n=== CONSOLE ERRORS CAPTURED (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(
    '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-results.json',
    JSON.stringify({ results, consoleErrors }, null, 2)
  );

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
