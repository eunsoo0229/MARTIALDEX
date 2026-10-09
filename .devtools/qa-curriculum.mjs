import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR =
  '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-curriculum-shots';
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

// Isolated profile shared by both launches (restart test) — never the real
// app profile, which this script used to clear, and which a running copy of
// MARTIALDEX keeps locked (localStorage then silently stays in memory only).
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-curriculum-'));

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronBin,
    args: [APP_DIR, `--user-data-dir=${USER_DATA_DIR}`],
    env: cleanEnv,
    timeout: 30000,
  });
  const page =
    app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ??
    (await app.firstWindow());
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

  // ============ 1. LEARNING HUB ============
  await goto('#/learning');
  const artCardCount = await page.evaluate(() => document.querySelectorAll('.art-card').length);
  check('Learning hub shows 10 martial arts', artCardCount === 10, `count=${artCardCount}`);
  check(
    'Learning hub shows empty "이어서 학습하기" on fresh state',
    !!(await page.evaluate(() => document.querySelector('.empty-state')))
  );
  await shot('01-learning-hub');

  // ============ 2. CURRICULUM LIST (official) ============
  await goto('#/learning/bjj');
  const heroTitle = await textOf('.curriculum-hero h3');
  check('BJJ official curriculum hero renders', heroTitle?.includes('주짓수') ?? false, heroTitle);
  const statNumbers = await page.evaluate(() =>
    [...document.querySelectorAll('.curriculum-stat-row strong')].map((e) => e.textContent)
  );
  check('Curriculum hero shows stat numbers', statNumbers.length === 4, JSON.stringify(statNumbers));
  await shot('02-curriculum-list-bjj');

  // ============ 3. TODAY -> DAY 1 DETAIL ============
  check('오늘 학습하기 click ->', (await clickText('오늘 학습하기')) === 'OK');
  await new Promise((r) => setTimeout(r, 500));
  const dayTitle = await textOf('.detail-hero h1');
  check('Day 1 detail loads', dayTitle?.includes('Day 1') ?? false, dayTitle);
  const goalCount = await page.evaluate(() => document.querySelectorAll('.info-card li').length);
  check('Day 1 shows learning goals', goalCount > 0, `count=${goalCount}`);
  const techLinkCount = await page.evaluate(
    () => [...document.querySelectorAll('a.technique-row')].filter((a) => a.getAttribute('href')?.includes('/arts/')).length
  );
  check('Day 1 shows technique cards linking to real technique pages', techLinkCount > 0, `count=${techLinkCount}`);
  const videoCardPresent = await page.evaluate(
    () => [...document.querySelectorAll('.info-card')].some((c) => c.querySelector('h3')?.textContent?.includes('관련 영상'))
  );
  check('Day 1 shows YouTube related-video section (reused component)', videoCardPresent);
  const safetyNoteVisible = await page.evaluate(() => !!document.querySelector('.modal-note'));
  check('Day 1 shows safety note', safetyNoteVisible);
  await shot('03-day1-detail');

  // ============ 4. AI ON DAY CONTEXT ============
  check('AI에게 질문 click ->', (await clickText('✦ AI에게 질문')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const aiIntro = await textOf('.ai-modal p');
  check('Day AI modal intro mentions Day 1', aiIntro?.includes('Day 1') ?? false, aiIntro);
  await page.click('.ai-modal textarea');
  await page.keyboard.type('오늘 배우는 기술들의 차이점을 설명해줘.', { delay: 10 });
  await clickText('질문 보내기');
  let aiResult = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 500));
    aiResult = await page.evaluate(() => {
      const modal = document.querySelector('.ai-modal');
      const bubble = modal?.querySelector('.ai-msg--model .ai-msg__bubble:not(.ai-msg__bubble--loading)');
      const err = modal?.querySelector('.ai-error');
      return { text: bubble?.textContent ?? null, error: err?.textContent ?? null };
    });
    if (aiResult.text || aiResult.error) break;
  }
  check('Day-context AI question gets a response or graceful error', !!(aiResult?.text || aiResult?.error), aiResult?.text?.slice(0, 60) ?? aiResult?.error);
  await shot('04-day-ai-response');
  await clickText('닫기');
  await new Promise((r) => setTimeout(r, 200));

  // ============ 5. COMPLETE DAY 1, CHECK PROGRESS ============
  check('학습 완료 click ->', (await clickText('학습 완료로 표시')) === 'OK');
  await new Promise((r) => setTimeout(r, 300));
  const completedLabel = await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('학습 완료됨'))?.textContent
  );
  check('Day marked complete', completedLabel?.includes('완료됨') ?? false, completedLabel);

  await clickText('전체 Day 목록');
  await new Promise((r) => setTimeout(r, 400));
  const day1Done = await page.evaluate(() => !!document.querySelector('.day-card--done'));
  check('Day list shows Day 1 as done', day1Done);
  await shot('05-day-list-with-progress');

  await goto('#/learning/bjj');
  const currentDayStat = await page.evaluate(() => document.querySelectorAll('.curriculum-stat-row strong')[1]?.textContent);
  check('Curriculum overview reflects currentDay advanced to 2', currentDayStat === '2', currentDayStat);

  // ============ 6. RESTART APP -> PROGRESS PERSISTS ============
  // Quit the way a user does (app.quit, then wait for the process to exit).
  // Playwright's app.close() drops its debugging pipe right after app.quit(),
  // which can end the process before Chromium writes localStorage to disk.
  {
    const exited = new Promise((r) => app.process().once('exit', r));
    await app.evaluate(({ app: a }) => { setTimeout(() => a.quit(), 0); });
    await exited;
  }
  ({ app, page, consoleErrors } = await launch());
  await goto('#/learning/bjj');
  await new Promise((r) => setTimeout(r, 400));
  const currentDayAfterRestart = await page.evaluate(() => document.querySelectorAll('.curriculum-stat-row strong')[1]?.textContent);
  check('Progress persists after app restart', currentDayAfterRestart === '2', currentDayAfterRestart);
  await shot('06-after-restart');

  // ============ 7. LEARNING HUB SHOWS ACTIVE PROGRESS ============
  await goto('#/learning');
  const activeRowText = await textOf('.technique-row__sub');
  check('Learning hub "이어서 학습하기" shows BJJ progress', activeRowText?.includes('Day 2') ?? false, activeRowText);

  // ============ 8. CUSTOM CURRICULUM CREATE ============
  await goto('#/learning/new?martialArt=bjj');
  await new Promise((r) => setTimeout(r, 500));
  await page.fill('.curriculum-editor input.select', '나의 MMA 기초 30일');
  await clickText('+ Day 추가');
  await new Promise((r) => setTimeout(r, 200));
  check('New custom curriculum + Day created', (await page.evaluate(() => document.querySelectorAll('.curriculum-editor-day').length)) === 1);

  check('+ 기술 추가 click ->', (await clickText('+ 기술 추가')) === 'OK');
  await new Promise((r) => setTimeout(r, 200));
  await page.fill('.technique-picker input', 'Armbar');
  await new Promise((r) => setTimeout(r, 400));
  check('Technique picker shows real search results', (await page.evaluate(() => document.querySelectorAll('.technique-picker__results .search-result-row').length)) > 0);
  await page.click('.technique-picker__results .search-result-row');
  await new Promise((r) => setTimeout(r, 300));
  const chipText = await textOf('.curriculum-editor-day .chip.active');
  check('Technique added to day as a chip', chipText?.includes('Armbar') ?? false, chipText);
  await shot('07-editor-with-technique');

  // set visibility to public for the community test
  const visibilitySetResult = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('.curriculum-editor select')].find((s) =>
      [...s.options].some((o) => o.value === 'public')
    );
    if (!sel) return 'NOT_FOUND';
    sel.value = 'public';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  });
  check('Visibility set to public ->', visibilitySetResult === 'OK');
  await new Promise((r) => setTimeout(r, 300));

  check('저장하고 보기 click ->', (await clickText('저장하고 보기')) === 'OK');
  await new Promise((r) => setTimeout(r, 400));
  const customTitle = await textOf('.detail-hero h1');
  check('Custom curriculum day-list renders after save', customTitle?.includes('나의 MMA 기초') ?? false, customTitle);
  await shot('08-custom-curriculum-saved');

  // ============ 9. COMMUNITY: SHOW + COPY SHARE CODE ============
  await goto('#/community');
  await new Promise((r) => setTimeout(r, 400));
  const communityCardText = await page.evaluate(() =>
    [...document.querySelectorAll('.info-card')].map((c) => c.textContent).find((t) => t?.includes('나의 MMA 기초'))
  );
  check('Community page lists the public custom curriculum', !!communityCardText, communityCardText?.slice(0, 80));

  // grant clipboard perms then copy the share code via in-page evaluate (avoids OS clipboard permission prompts)
  const shareCode = await page.evaluate(() => {
    return new Promise((resolve) => {
      const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async (text) => {
        window.__lastCopied = text;
        return origWriteText ? Promise.resolve() : undefined;
      };
      resolve(null);
    });
  });
  await clickText('공유 코드 복사', 'button');
  await new Promise((r) => setTimeout(r, 300));
  const copiedCode = await page.evaluate(() => window.__lastCopied ?? null);
  check('Share code generated on copy click', typeof copiedCode === 'string' && copiedCode.startsWith('MDCUR1.'), copiedCode?.slice(0, 20));
  await shot('09-community-list');

  // ============ 10. IMPORT SHARE CODE -> COPY TO MINE, ORIGINAL UNTOUCHED ============
  if (copiedCode) {
    await page.fill('textarea', copiedCode);
    check('코드 확인 click ->', (await clickText('코드 확인')) === 'OK');
    await new Promise((r) => setTimeout(r, 300));
    const previewText = await textOf('.curriculum-import-preview');
    check('Import preview shows decoded curriculum', previewText?.includes('나의 MMA 기초') ?? false, previewText?.slice(0, 80));
    await shot('10-import-preview');

    const myCurriculaCountBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').length);
    check('내 커리큘럼에 추가 click ->', (await clickText('내 커리큘럼에 추가')) === 'OK');
    await new Promise((r) => setTimeout(r, 500));
    const myCurriculaCountAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').length);
    check('Import creates a NEW copy (count +1, original untouched)', myCurriculaCountAfter === myCurriculaCountBefore + 1, `${myCurriculaCountBefore} -> ${myCurriculaCountAfter}`);
    const importedTitle = await textOf('.detail-hero h1');
    check('Navigated to the newly imported copy', importedTitle?.includes('나의 MMA 기초') ?? false, importedTitle);
    await shot('11-imported-copy');
  }

  // ============ 11. REGRESSION: existing features still work ============
  await goto('#/');
  const artCardsHome = await page.evaluate(() => document.querySelectorAll('.art-card').length);
  check('[Regression] Home still shows 10 martial arts', artCardsHome === 10, `count=${artCardsHome}`);

  await page.evaluate(() => document.querySelector('.search-box--hero input')?.focus());
  await page.keyboard.type('Armbar', { delay: 15 });
  await new Promise((r) => setTimeout(r, 350));
  const searchCount = await page.evaluate(() => document.querySelectorAll('.search-result-row').length);
  check('[Regression] Global search still works', searchCount > 0, `count=${searchCount}`);
  await page.keyboard.press('Escape');

  await goto('#/arts/bjj/techniques/bjj__armbar');
  const techDetailH1 = await textOf('.detail-hero h1');
  check('[Regression] Technique detail page still works', techDetailH1 === 'Armbar', techDetailH1);
  const videoIframeCount = await page.evaluate(() => document.querySelectorAll('.video-embed iframe').length);
  check('[Regression] YouTube embed still works', videoIframeCount > 0, `count=${videoIframeCount}`);

  await goto('#/arts/bjj/techniques');
  const filterResult = await page.evaluate(() => {
    const sel = document.querySelector('select.select');
    if (!sel || sel.options.length < 2) return 'NO_OPTIONS';
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  });
  check('[Regression] Filter dropdown still works', filterResult === 'OK');
  await shot('12-regression-filter');

  console.log('\n=== CONSOLE ERRORS CAPTURED (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }

  fs.writeFileSync(
    '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-curriculum-results.json',
    JSON.stringify({ results, consoleErrors }, null, 2)
  );

  await app.close();
  process.exit(failed.length > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
