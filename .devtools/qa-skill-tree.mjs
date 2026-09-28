import { _electron as electron } from 'playwright-core';
import path from 'node:path';

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

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(900);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.evaluate(() => {
    location.hash = '#/skill-tree';
  });
  await sleep(700);
  let text = await page.evaluate(() => document.body.innerText);
  check('[UI] Skill tree page loads with martial-art filter default-selected', text.includes('비주얼 기술 트리') && text.includes('전체 기술'), text.slice(0, 300));

  // ---- 1/2/3: nodes + real relation data (no fabricated relations) ----
  const nodeInfo = await page.evaluate(() => {
    const circles = document.querySelectorAll('.graph-svg .graph-node circle');
    const lines = document.querySelectorAll('.graph-svg line');
    return { nodeCount: circles.length, edgeCount: lines.length };
  });
  check('[1] Technique nodes rendered as SVG circles', nodeInfo.nodeCount > 0, JSON.stringify(nodeInfo));
  check('[2] Real connection edges drawn between nodes (from actual relatedTechniques/transitions data)', nodeInfo.edgeCount > 0, JSON.stringify(nodeInfo));

  // ---- 3: edges only reference real, resolvable technique ids (verify at the data layer directly) ----
  const edgeIntegrity = await page.evaluate(async () => {
    const { getTechniquesByMartialArt } = await import('/src/lib/loadData.ts');
    const { getTechniqueConnections } = await import('/src/lib/techniqueGraph/buildGraph.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const techniques = getTechniquesByMartialArt('bjj');
    let checked = 0;
    let allReal = true;
    for (const t of techniques.slice(0, 60)) {
      const conns = getTechniqueConnections(t);
      for (const kind of ['prerequisite', 'chain', 'next']) {
        for (const c of conns[kind]) {
          checked++;
          if (!resolveTechnique(c.techniqueId)) allReal = false;
        }
      }
    }
    return { checked, allReal };
  });
  check('[3] Every edge references a real, resolvable technique id (no invented relations)', edgeIntegrity.checked > 0 && edgeIntegrity.allReal, JSON.stringify(edgeIntegrity));

  // ---- 4/9: mastery status coloring + real progress data ----
  const statusSetup = await page.evaluate(async () => {
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: ['bjj__armbar'],
      completed: true,
      estimatedMinutes: 5,
      actualMinutes: 5,
      notes: null,
      source: 'combo',
    });
    return true;
  });
  await page.evaluate(() => {
    location.hash = '#/skill-tree';
  });
  await sleep(200);
  // Select BJJ explicitly to make sure Armbar is in view.
  const selects = await page.$$('select');
  await selects[0].selectOption('bjj');
  await sleep(500);
  const startedCount = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.curriculum-stat-row > div')];
    const cell = cells.find((c) => c.querySelector('span')?.textContent === '학습 시작');
    return cell ? Number(cell.querySelector('strong')?.textContent?.replace(/[^0-9]/g, '')) : null;
  });
  check('[4][9] Real progress data reflected in the stat row (학습 시작 count > 0 after a real training-history entry)', startedCount !== null && startedCount > 0, String(startedCount));

  // ---- 5: martial-art filter actually changes the rendered set ----
  const bjjCount = await page.evaluate(() => document.querySelectorAll('.graph-svg .graph-node').length);
  await selects[0].selectOption('boxing');
  await sleep(400);
  const boxingCount = await page.evaluate(() => document.querySelectorAll('.graph-svg .graph-node').length);
  check('[5] Martial-art filter changes the rendered node set', bjjCount !== boxingCount, JSON.stringify({ bjjCount, boxingCount }));

  // Category filter narrows further.
  const categorySelect = (await page.$$('select'))[1];
  const categoryOptions = await categorySelect.evaluate((el) => [...el.options].map((o) => o.value).filter(Boolean));
  if (categoryOptions[0]) {
    await categorySelect.selectOption(categoryOptions[0]);
    await sleep(400);
    const narrowedCount = await page.evaluate(() => document.querySelectorAll('.graph-svg .graph-node').length);
    check('[5b] Category filter narrows the node set further', narrowedCount <= boxingCount, JSON.stringify({ narrowedCount, boxingCount }));
  }

  // ---- 6: clicking a node navigates to the existing technique detail page ----
  await categorySelect.selectOption('');
  await sleep(300);
  await selects[0].selectOption('bjj');
  await sleep(500);
  await page.locator('.graph-svg .graph-node').first().click({ force: true });
  await sleep(500);
  const url = page.url();
  text = await page.evaluate(() => document.body.innerText);
  check('[6] Clicking a node navigates to the EXISTING technique detail page (same UI, no new detail screen)', url.includes('/arts/bjj/techniques/') && text.includes('숙련도'), url);

  // ---- 7: zoom/pan controls exist and mutate view state ----
  await page.evaluate(() => history.back());
  await sleep(500);
  await page.evaluate(() => {
    location.hash = '#/skill-tree';
  });
  await sleep(600);
  const zoomBefore = await page.evaluate(() => document.querySelector('.graph-svg g')?.getAttribute('transform'));
  await page.click('button:has-text("확대 +")');
  await sleep(150);
  const zoomAfter = await page.evaluate(() => document.querySelector('.graph-svg g')?.getAttribute('transform'));
  check('[7] Zoom control changes the SVG transform (scale)', zoomBefore !== zoomAfter, JSON.stringify({ zoomBefore, zoomAfter }));

  // ---- 8: performance scoping — never renders the full 1253-technique corpus at once ----
  const perfCheck = await page.evaluate(async () => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const rendered = document.querySelectorAll('.graph-svg .graph-node').length;
    return { totalCatalog: allTechniques.length, renderedNow: rendered };
  });
  check('[8] Tree renders a scoped subset (per martial art/category), not all 1253 at once', perfCheck.renderedNow < perfCheck.totalCatalog, JSON.stringify(perfCheck));

  // ---- 10: existing encyclopedia/search/posture features untouched ----
  await page.evaluate(() => {
    location.hash = '#/techniques';
  });
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[10a] Technique encyclopedia (전체 기술 검색) still works', text.includes('전체 기술 검색'), text.slice(0, 200));

  await page.evaluate(() => {
    location.hash = '#/arts/bjj/techniques/bjj__armbar';
  });
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[10b] Technique detail + posture section still render normally', text.includes('Armbar') && (text.includes('자세') || text.includes('설명')), text.slice(0, 300));

  const officialCount = await page.evaluate(async () => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    return allTechniques.length;
  });
  check('[regression] Official technique catalog still has all 1284 techniques', officialCount === 1284, String(officialCount));
  check('[regression2] No console/page errors across the whole flow', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
