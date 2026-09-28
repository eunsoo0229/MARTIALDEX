import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-graph-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function main() {
  let { app, page, consoleErrors } = await launch();

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
  async function textsOf(sel) {
    return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent?.trim() ?? ''), sel);
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

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // ============ 1. NAV + EMPTY BROWSE ============
  // "기술 그래프" now lives in the header's collapsed "메뉴" dropdown (added
  // once the nav bar grew past what fits on one line) — open it first.
  check('메뉴 dropdown opens ->', (await clickText('메뉴', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  check('Nav has "기술 그래프" link', (await clickText('기술 그래프', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('Landed on graph page', ((await textOf('.section-title h2')) ?? '').includes('기술 그래프'));
  check('Prompts to pick a martial art before showing anything', ((await textOf('.empty-state')) ?? '').includes('무술을 선택'));
  await shot('01-graph-empty');

  // ============ 2. BROWSE LIST: MARTIAL ART + POSITION + SEARCH FILTERS ============
  const martialArtSelected = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select.select')][0];
    if (!sel) return 'NO_SELECT';
    const opt = [...sel.options].find((o) => o.textContent?.includes('주짓수'));
    if (!opt) return 'NO_BJJ_OPTION';
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  });
  check('Martial art (BJJ) select ->', martialArtSelected === 'OK', martialArtSelected);
  await new Promise((r) => setTimeout(r, 400));
  const chipCountBeforeFilter = await page.evaluate(() => document.querySelectorAll('.chip-row .chip').length);
  check('Browse list shows technique chips for BJJ', chipCountBeforeFilter > 50, `count=${chipCountBeforeFilter}`);
  await shot('02-graph-browse-bjj');

  await page.fill('input.select', 'Armbar');
  await new Promise((r) => setTimeout(r, 300));
  const chipsAfterSearch = await textsOf('.chip-row .chip');
  check('Search narrows browse list to Armbar', chipsAfterSearch.some((c) => c.includes('Armbar')) && chipsAfterSearch.length < chipCountBeforeFilter, JSON.stringify(chipsAfterSearch));
  await shot('03-graph-browse-search');

  // ============ 3. CENTER ON A TECHNIQUE WITH REAL CONNECTIONS ============
  check('Armbar chip click -> centers graph', (await clickText('Armbar', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  const centerTitle = await textOf('.detail-hero h1');
  check('Graph centered on Armbar', centerTitle === 'Armbar', centerTitle);
  const svgPresent = await page.evaluate(() => !!document.querySelector('.graph-svg'));
  check('Graph SVG rendered (Armbar has real transitions/relatedTechniques data)', svgPresent);
  const nodeCount = await page.evaluate(() => document.querySelectorAll('.graph-node').length);
  check('Graph shows real connected technique nodes', nodeCount > 0, `nodes=${nodeCount}`);
  const legendText = (await textsOf('.chip-row .chip')).join(' | ');
  check('Legend shows relation-kind labels', legendText.includes('연결 기술') && legendText.includes('선행 기술'), legendText);
  await shot('04-graph-centered-armbar');

  // ============ 4. ZOOM / RESET CONTROLS ============
  check('확대 + click ->', (await clickText('확대 +', 'button')) === 'OK');
  check('축소 − click ->', (await clickText('축소 −', 'button')) === 'OK');
  check('보기 초기화 click ->', (await clickText('보기 초기화', 'button')) === 'OK');

  // ============ 5. CLICK A NODE -> RE-CENTERS + BACK HISTORY ============
  const firstNodeName = await page.evaluate(() => document.querySelector('.graph-node__label:not(.graph-node__label--center)')?.textContent ?? null);
  check('Found a connected node to click', !!firstNodeName, firstNodeName);
  if (firstNodeName) {
    await page.evaluate(() => document.querySelector('.graph-node')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await new Promise((r) => setTimeout(r, 400));
    const newCenterTitle = await textOf('.detail-hero h1');
    check('Clicking a node re-centers the graph on that real technique', newCenterTitle === firstNodeName, `${firstNodeName} vs ${newCenterTitle}`);
    check('"이전 기술" back-history button appears after re-centering', (await textOf('.btn.btn-ghost.btn-sm')) !== null);
    check('이전 기술 click -> returns to Armbar', (await clickText('이전 기술', 'button')) === 'OK');
    await new Promise((r) => setTimeout(r, 400));
    check('Back navigation restored Armbar as center', (await textOf('.detail-hero h1')) === 'Armbar');
  }
  await shot('05-graph-after-navigation');

  // ============ 6. LINKS: DETAIL PAGE + BACK TO BROWSE ============
  check('기술 상세 보기 click -> navigates to technique detail', (await clickText('기술 상세 보기', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('Technique detail page loaded for Armbar', (await textOf('.detail-hero h1')) === 'Armbar');

  // ============ 7. TECHNIQUE DETAIL PAGE SHOWS "기술 연결" CARD ============
  const connectionCardText = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.info-card')].find((c) => c.querySelector('h3')?.textContent?.includes('기술 연결'));
    return card ? card.textContent : null;
  });
  check('Technique detail shows 🔗 기술 연결 card with real category labels', !!connectionCardText && (connectionCardText.includes('연결 기술') || connectionCardText.includes('다음 기술')), connectionCardText?.slice(0, 200));
  check('그래프로 보기 link present on detail page', (await textOf('.btn.btn-secondary.btn-sm')) !== null || (await page.evaluate(() => [...document.querySelectorAll('a')].some((a) => a.textContent?.includes('그래프로 보기')))));
  await shot('06-technique-detail-connections');

  check('그래프로 보기 click -> opens graph pre-centered', (await clickText('그래프로 보기', 'a')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('Graph opened pre-centered on Armbar via query param', (await textOf('.detail-hero h1')) === 'Armbar');
  const urlHasParam = await page.evaluate(() => location.hash.includes('technique=bjj__armbar'));
  check('URL carries ?technique= query param', urlHasParam);

  check('← 목록으로 click -> back to browse', (await clickText('← 목록으로', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('Back at browse list (no center technique)', ((await textOf('.card.info-card h3')) ?? '').includes('무술/포지션'));

  // ============ 8. MASTERY COLOR REFLECTS REAL SKILL DATA ============
  // "Proficient" requires >=2 analyses with a non-declining trend (see
  // skillProgress/computeSkillProgress.ts, 14단계) — a single high score is
  // intentionally NOT enough, so two ascending records are seeded here.
  const seeded = await page.evaluate(() => {
    const now = Date.now();
    const recs = [
      { recordId: 'r1', techniqueId: 'bjj__triangle', martialArtId: 'bjj', score: 82, status: 'good', metricScores: {}, analyzedAt: new Date(now - 86400000).toISOString() },
      { recordId: 'r2', techniqueId: 'bjj__triangle', martialArtId: 'bjj', score: 88, status: 'good', metricScores: {}, analyzedAt: new Date(now).toISOString() },
    ];
    localStorage.setItem('martialdex:pose-records', JSON.stringify(recs));
    return true;
  });
  check('Seeded a proficient score for a connected technique (Triangle)', seeded);
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await goto('#/graph');
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select.select')][0];
    const opt = [...sel.options].find((o) => o.textContent?.includes('주짓수'));
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));
  const triangleChipText = await page.evaluate(() => [...document.querySelectorAll('.chip-row .chip')].find((c) => c.textContent?.includes('Triangle'))?.textContent ?? null);
  check('Browse chip for the seeded technique shows proficient (🟢) mastery icon', (triangleChipText ?? '').includes('🟢'), triangleChipText);
  await shot('07-graph-mastery-color');

  // ============ 9. AI CONNECTION (16-6): coach can answer "what's next after X" using real graph data ============
  await page.evaluate(() => {
    window.__MARTIALDEX_TEST_MOCK_ASK__ = async (request) => {
      window.__lastRequest = request;
      return { ok: true, text: '테스트 응답: 연결 데이터를 참고했습니다.' };
    };
  });
  check('Armbar chip click (re-center) ->', (await clickText('Armbar', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  check('✦ AI에게 질문 click ->', (await clickText('✦ AI에게 질문', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  check('이 기술을 배우고 나면... example question click ->', (await clickText('다음에 뭘 배우면 좋아?', 'button')) === 'OK');
  await new Promise((r) => setTimeout(r, 500));
  const capturedContext = await page.evaluate(() => window.__lastRequest?.contextText ?? null);
  check('AI context for Armbar includes real technique-graph connection data', !!capturedContext && capturedContext.includes('실제 기술 연결 데이터'), capturedContext?.slice(0, 300));
  await clickText('닫기');

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 10. RESTART -> PERSISTENCE (mastery color) ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  await goto('#/arts/bjj/techniques/bjj__triangle');
  await new Promise((r) => setTimeout(r, 400));
  const triangleMastery = await textOf('.card.info-card .chip.active');
  check('Seeded mastery persists after restart', (triangleMastery ?? '').includes('숙련'), triangleMastery);

  // ============ REGRESSION ============
  await goto('#/');
  check('[Regression] Home shows 10 martial arts', (await page.evaluate(() => document.querySelectorAll('.art-card').length)) === 10);
  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('Armbar', { delay: 15 });
  await new Promise((r) => setTimeout(r, 350));
  check('[Regression] Search still works', (await page.evaluate(() => document.querySelectorAll('.search-result-row').length)) > 0);
  await page.keyboard.press('Escape');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  check('[Regression] Technique detail still works', (await textOf('.detail-hero h1')) === 'Armbar');
  check('[Regression] YouTube embed still works', (await page.evaluate(() => document.querySelectorAll('.video-embed iframe').length)) > 0);

  await goto('#/arts/bjj/techniques');
  const filterResult = await page.evaluate(() => {
    const sel = document.querySelector('select.select');
    if (!sel || sel.options.length < 2) return 'NO_OPTIONS';
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  });
  check('[Regression] Filter still works', filterResult === 'OK');

  await goto('#/learning/bjj');
  check('[Regression] Official curriculum overview still works', ((await textOf('.curriculum-hero h3')) ?? '').includes('주짓수'));

  await goto('#/fighter-style');
  check('[Regression] Fighter-style hub still works', ((await textOf('.section-title h2')) ?? '') === '선수 스타일 학습');

  await goto('#/coach');
  check('[Regression] AI Coach page still works', ((await textOf('.section-title h2')) ?? '').includes('AI 개인 코치'));

  await goto('#/sparring');
  check('[Regression] Sparring analysis hub still works', ((await textOf('.section-title h2')) ?? '').includes('스파링 분석'));

  await goto('#/my-skills');
  const overallStats = await textsOf('.curriculum-stat-row strong');
  check('[Regression] My Skills dashboard still works', Number(overallStats[0]) > 1000, overallStats[0]);

  await goto('#/arts/boxing/techniques/boxing__jab');
  check('[Regression] Pose-analysis button still present on supported technique', await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기'))));

  console.log('\n=== CONSOLE ERRORS TOTAL (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(path.join(SCRATCH, 'qa-graph-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
