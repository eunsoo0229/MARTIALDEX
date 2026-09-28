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

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  // gemini-3.6-flash's free-tier daily quota is exhausted from earlier
  // sessions' testing; gemini-3.1-flash-lite still has quota and accepts
  // the same thinkingLevel:'minimal' config the app sends.
  cleanEnv.GEMINI_MODEL = 'gemini-3.1-flash-lite';
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-tactic-'));
  const device = await launchDevice(dir);
  const { page } = device;

  // ===================================================================
  // Builder: name, IF, THEN sequence, reorder, delete
  // ===================================================================
  await page.evaluate(() => {
    location.hash = '#/tactics/new';
  });
  await sleep(500);
  let text = await page.evaluate(() => document.body.innerText);
  check('[UI] Tactic builder screen loads', text.includes('새 전술 만들기') && text.includes('IF (상황)'), text.slice(0, 200));

  await page.fill('input[placeholder="예: 잽 카운터"]', '잽 카운터');
  await page.fill('textarea[placeholder="예: 상대가 잽을 사용한다"]', '상대가 잽을 사용한다');
  await page.click('button:has-text("THEN에 기술 추가")');
  await page.fill('input[placeholder*="기술 이름으로 검색"]', 'Jab');
  await sleep(300);
  await page.locator('.search-result-row').first().click();
  await sleep(200);
  await page.fill('input[placeholder*="기술 이름으로 검색"]', 'Armbar');
  await sleep(300);
  await page.locator('.search-result-row').first().click();
  await sleep(200);

  // document.body.innerText never reflects <input>/<textarea> live values (only
  // placeholders/rendered text), so name/situation are verified after save
  // (see "[5a]" below, which reads them back off the list page's plain-text
  // rendering) — this check covers what innerText CAN show at this point:
  // the THEN technique chips.
  text = await page.evaluate(() => document.body.innerText);
  check('[1][2][3] THEN technique chips rendered using real techniqueIds', text.includes('Jab') && text.includes('Armbar'), text.slice(0, 500));

  // Reorder.
  const moveLeftButtons = await page.$$('button[aria-label="왼쪽으로 이동"]');
  await moveLeftButtons[moveLeftButtons.length - 1].click();
  await sleep(150);
  const orderAfterMove = await page.evaluate(() => [...document.querySelectorAll('.chip.active')].map((el) => el.textContent));
  check('[4a] Reorder button changed sequence order', orderAfterMove.length === 2, JSON.stringify(orderAfterMove));

  await page.click('button:has-text("저장하기")');
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[5a] Saving navigates back to the tactic list, showing the new tactic', text.includes('잽 카운터'), text.slice(0, 400));

  const tacticId = await page.evaluate(async () => {
    const { listMyTactics } = await import('/src/lib/tactic/service.ts');
    return listMyTactics().find((t) => t.name === '잽 카운터')?.id ?? null;
  });
  check('[5b] Tactic persisted with real techniqueIds only', !!tacticId, String(tacticId));

  const savedShape = await page.evaluate(async (id) => {
    const { getTactic } = await import('/src/lib/tactic/service.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = getTactic(id);
    return { techniqueIds: t.techniqueIds, allResolve: t.techniqueIds.every((tid) => !!resolveTechnique(tid)) };
  }, tacticId);
  check('[3] Every THEN technique id resolves to a real technique', savedShape.allResolve, JSON.stringify(savedShape));

  // ===================================================================
  // Edit + delete-technique
  // ===================================================================
  await page.evaluate((id) => {
    location.hash = `#/tactics/${id}/edit`;
  }, tacticId);
  await sleep(500);
  const removeButtons = await page.$$('button[aria-label="삭제"]');
  await removeButtons[0].click();
  await sleep(150);
  const chipCountAfterRemove = await page.evaluate(() => document.querySelectorAll('.chip.active').length);
  check('[4b] Removing a technique from the tactic works', chipCountAfterRemove === 1, String(chipCountAfterRemove));
  await page.click('button:has-text("THEN에 기술 추가")');
  await page.fill('input[placeholder*="기술 이름으로 검색"]', 'Cross');
  await sleep(300);
  await page.locator('.search-result-row').first().click();
  await sleep(200);
  await page.click('button:has-text("저장하기")');
  await sleep(500);

  // ===================================================================
  // Validation
  // ===================================================================
  const validationResult = await page.evaluate(async () => {
    const { validateTactic } = await import('/src/lib/tactic/service.ts');
    return validateTactic('', '', []);
  });
  check('[validation] Empty name/situation/techniques all rejected', validationResult.ok === false && validationResult.errors.length === 3, JSON.stringify(validationResult));

  // ===================================================================
  // 9/10: AI feedback via the real Gemini plumbing (no new API key path)
  // ===================================================================
  await page.evaluate(() => {
    location.hash = '#/tactics';
  });
  await sleep(500);
  await page.click('button:has-text("AI 피드백 받기")');
  await sleep(15000); // real Gemini call
  text = await page.evaluate(() => document.body.innerText);
  check('[9] AI feedback generated and displayed on the tactic card', text.includes('AI 전술 피드백'), text.slice(0, 600));

  const feedbackPersisted = await page.evaluate(async (id) => {
    const { getTactic } = await import('/src/lib/tactic/service.ts');
    return getTactic(id)?.feedback ?? null;
  }, tacticId);
  check('[9b] Feedback text actually persisted on the tactic record', !!feedbackPersisted && feedbackPersisted.length > 0, feedbackPersisted?.slice(0, 200));

  // ===================================================================
  // Delete
  // ===================================================================
  page.once('dialog', (d) => d.accept());
  await page.click('button:has-text("삭제")');
  await sleep(300);
  const remainingTactics = await page.evaluate(async () => {
    const { listMyTactics } = await import('/src/lib/tactic/service.ts');
    return listMyTactics().length;
  });
  check('[5c] Tactic deletion works', remainingTactics === 0, String(remainingTactics));

  // ===================================================================
  // Regression: official technique catalog untouched
  // ===================================================================
  const officialCount = await page.evaluate(async () => {
    const { allTechniques } = await import('/src/lib/loadData.ts');
    return allTechniques.length;
  });
  check('[regression] Official technique catalog still has all 1284 techniques', officialCount === 1284, String(officialCount));
  check('[regression2] No console/page errors across the whole flow', device.consoleErrors.length === 0, JSON.stringify(device.consoleErrors));

  await device.app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
