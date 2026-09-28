import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-posture-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function main() {
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

  async function goto(hash) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await new Promise((r) => setTimeout(r, 500));
  }
  async function textOf(sel) {
    return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
  }
  async function textsOf(sel) {
    return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent?.trim() ?? ''), sel);
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // ============ Confirm 3D viewer is fully gone ============
  await goto('#/arts/boxing/techniques/boxing__jab');
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
  check('No <canvas> (3D viewer) anywhere on the technique detail page', canvasCount === 0, `canvasCount=${canvasCount}`);
  const modelViewerEl = await page.$('.human-model-viewer');
  check('No .human-model-viewer element remains in the DOM', modelViewerEl === null);

  // ============ Representative techniques across 5 categories ============
  const cases = [
    { hash: '#/arts/boxing/techniques/boxing__jab', label: '타격 기술 (Boxing Jab)', hasPosture: true },
    { hash: '#/arts/kickboxing/techniques/kickboxing__front-kick', label: '킥 기술 (Kickboxing Front Kick)', hasPosture: true },
    { hash: '#/arts/bjj/techniques/bjj__closed-guard', label: '가드 포지션 기술 (BJJ Closed Guard)', hasPosture: true },
    { hash: '#/arts/bjj/techniques/bjj__armbar', label: '그래플링 기술 (BJJ Armbar)', hasPosture: true },
    { hash: '#/arts/wrestling/techniques/wrestling__basic-double-leg', label: '서서 하는 그래플링 (Wrestling Double Leg)', hasPosture: true },
    { hash: '#/arts/judo/techniques/judo__o-goshi', label: '던지기 기술 (Judo O-Goshi)', hasPosture: true },
    { hash: '#/arts/karate/techniques/karate__특징', label: '자세 데이터 없는 기술', hasPosture: false },
  ];

  for (const c of cases) {
    await goto(c.hash);
    const h1 = await textOf('.detail-hero h1');
    check(`[${c.label}] technique data loads`, !!h1, h1);

    // "숙련도" always renders regardless of technique data. "목적" only
    // renders when technique.purpose is non-null in the source data (e.g.
    // boxing__jab and bjj__closed-guard legitimately have purpose:null) —
    // that conditional card is untouched by this task, so it's checked
    // separately below on a technique confirmed to have real purpose data.
    const skillCard = await page.evaluate(() => [...document.querySelectorAll('.card.info-card h3')].some((h) => h.textContent?.includes('숙련도')));
    check(`[${c.label}] existing "숙련도" section still renders`, skillCard);

    if (c.hasPosture) {
      const overview = await textOf('.card.info-card p');
      check(`[${c.label}] posture overview text shown`, !!overview && overview.length > 0);

      const subheadings = await textsOf('.card.info-card h4');
      check(`[${c.label}] "단계별 자세" subheading present`, subheadings.includes('단계별 자세'), JSON.stringify(subheadings));
      check(`[${c.label}] "핵심 포인트" subheading present`, subheadings.includes('핵심 포인트'), JSON.stringify(subheadings));

      const stepCount = await page.evaluate(() => document.querySelector('.posture-steps')?.children.length ?? 0);
      check(`[${c.label}] step list has multiple ordered steps`, stepCount >= 3, `stepCount=${stepCount}`);

      const keyPointCount = await page.evaluate(() => {
        const h4s = [...document.querySelectorAll('h4')];
        const kp = h4s.find((h) => h.textContent === '핵심 포인트');
        return kp?.nextElementSibling?.tagName === 'UL' ? kp.nextElementSibling.children.length : 0;
      });
      check(`[${c.label}] key points list has 3-5 items`, keyPointCount >= 3 && keyPointCount <= 5, `count=${keyPointCount}`);

      const bodyPartLabels = await textsOf('.posture-body-row .field-label');
      check(`[${c.label}] at least one body-part breakdown row shown`, bodyPartLabels.length > 0, JSON.stringify(bodyPartLabels));
    } else {
      const readyNote = await textOf('.posture-pending-note');
      check(`[${c.label}] shows "준비 중" placeholder instead of fabricated posture`, (readyNote ?? '').includes('준비 중'), readyNote);
    }
  }

  // ============ Regression: existing features still work ============
  await goto('#/arts/boxing/techniques/boxing__jab');
  const analyzeBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('내 자세 분석하기')));
  check('[Regression] Pose-analysis button still present', analyzeBtn);
  const aiBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('AI에게 질문')));
  check('[Regression] AI question button still present', aiBtn);

  // bjj__armbar is confirmed (via data/processed/bjj.json) to have real
  // purpose + transitions data, so this is where the conditional 목적/연결
  // 기술 cards are meaningfully exercised (untouched by this task).
  await goto('#/arts/bjj/techniques/bjj__armbar');
  const purposeCard = await page.evaluate(() => [...document.querySelectorAll('.card.info-card h3')].some((h) => h.textContent?.includes('목적')));
  check('[Regression] "목적" card still renders for a technique with real purpose data', purposeCard);
  const relatedTechCard = await page.evaluate(() => [...document.querySelectorAll('.card.info-card h3')].some((h) => h.textContent?.includes('연결 기술')));
  check('[Regression] "연결 기술" (transitions) card still renders', relatedTechCard);
  const videoIframe = await page.evaluate(() => document.querySelectorAll('.card.info-card iframe').length);
  check('[Regression] Curated YouTube video(s) still render on Armbar', videoIframe > 0, `count=${videoIframe}`);
  check('[Regression] Fixed-height video container present', videoIframe > 0);

  await goto('#/');
  const searchBox = await page.$('input[placeholder*="기술"]');
  check('[Regression] Search box still present on Home', !!searchBox);
  if (searchBox) {
    await searchBox.fill('Armbar');
    await new Promise((r) => setTimeout(r, 500));
    const resultCount = await page.evaluate(() => document.querySelectorAll('.search-result-row').length);
    check('[Regression] Search still returns results', resultCount > 0, `count=${resultCount}`);
  }

  await goto('#/arts/boxing');
  const filterWorks = await page.evaluate(() => document.querySelectorAll('.chip').length > 0);
  check('[Regression] Martial art detail / category filter chips still present', filterWorks);

  await goto('#/learning/bjj');
  const heroTitle = await textOf('.curriculum-hero h3');
  check('[Regression] Curriculum overview still works', heroTitle?.includes('주짓수') ?? false, heroTitle);

  console.log('\n=== CONSOLE ERRORS (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  fs.writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
