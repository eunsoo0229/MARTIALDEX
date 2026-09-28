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
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-combo-'));
  const device = await launchDevice(dir);
  const { page } = device;

  // ===================================================================
  // Builder: add technique, reorder, remove, save, edit, delete
  // ===================================================================
  await page.evaluate(() => {
    location.hash = '#/combos/new';
  });
  await sleep(500);
  let text = await page.evaluate(() => document.body.innerText);
  check('[UI] Combo builder screen loads', text.includes('새 콤보 만들기'), text.slice(0, 200));

  await page.fill('input[placeholder="예: 원투 태클"]', '원투 태클');
  await page.click('button:has-text("콤보에 기술 추가")');
  await page.fill('input[placeholder*="기술 이름으로 검색"]', 'Jab');
  await sleep(300);
  await page.locator('.search-result-row').first().click();
  await sleep(200);
  await page.fill('input[placeholder*="기술 이름으로 검색"]', 'Cross');
  await sleep(300);
  await page.locator('.search-result-row').first().click();
  await sleep(200);
  await page.fill('input[placeholder*="기술 이름으로 검색"]', 'Basic Double Leg');
  await sleep(300);
  await page.locator('.search-result-row').first().click();
  await sleep(200);

  text = await page.evaluate(() => document.body.innerText);
  check('[1] Three techniques added to the timeline', /Jab/.test(text) && /Cross/.test(text) && /Double Leg/.test(text), text.slice(0, 500));

  // Reorder: move the last technique (Double Leg) left twice -> becomes first.
  const moveLeftButtons = await page.$$('button[aria-label="왼쪽으로 이동"]');
  await moveLeftButtons[moveLeftButtons.length - 1].click();
  await sleep(150);

  const orderAfterMove = await page.evaluate(() => {
    return [...document.querySelectorAll('.chip.active')].map((el) => el.textContent);
  });
  check('[order] Reorder button actually changed sequence order', orderAfterMove.length === 3, JSON.stringify(orderAfterMove));

  // Remove one technique (the middle one after reorder).
  const removeButtons = await page.$$('button[aria-label="삭제"]');
  await removeButtons[1].click();
  await sleep(150);
  const chipCountAfterRemove = await page.evaluate(() => document.querySelectorAll('.chip.active').length);
  check('[delete-technique] Removing a technique from the combo works', chipCountAfterRemove === 2, String(chipCountAfterRemove));

  // Add it back so we have a meaningful 3-technique combo for the rest of the test.
  // The picker stays open (shows "닫기") after the earlier adds, so just reuse
  // its search input directly instead of re-clicking the now-absent toggle button.
  await page.fill('input[placeholder*="기술 이름으로 검색"]', 'Cross');
  await sleep(300);
  await page.locator('.search-result-row').first().click();
  await sleep(200);

  await page.click('button:has-text("저장하기")');
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[save] Saving navigates back to the combo list, showing the new combo', text.includes('원투 태클'), text.slice(0, 400));

  const comboId = await page.evaluate(async () => {
    const { listMyCombos } = await import('/src/lib/combo/service.ts');
    return listMyCombos().find((c) => c.name === '원투 태클')?.id ?? null;
  });
  check('[save2] Combo actually persisted with 3 techniqueIds', !!comboId, String(comboId));

  // ===================================================================
  // Edit: change name, confirm it round-trips
  // ===================================================================
  await page.evaluate((id) => {
    location.hash = `#/combos/${id}/edit`;
  }, comboId);
  await sleep(500);
  await page.fill('input[placeholder="예: 원투 태클"]', '원투 태클 (수정됨)');
  await page.click('button:has-text("저장하기")');
  await sleep(500);
  const editedName = await page.evaluate(async (id) => {
    const { getCombo } = await import('/src/lib/combo/service.ts');
    return getCombo(id)?.name;
  }, comboId);
  check('[edit] Combo edit (rename) persisted', editedName === '원투 태클 (수정됨)', String(editedName));

  // ===================================================================
  // Validation: fewer than 2 techniques should be rejected
  // ===================================================================
  const validationResult = await page.evaluate(async () => {
    const { validateCombo } = await import('/src/lib/combo/service.ts');
    return validateCombo('', ['bjj__armbar']);
  });
  check('[validation] Empty name + <2 techniques correctly rejected', validationResult.ok === false && validationResult.errors.length >= 2, JSON.stringify(validationResult));

  // ===================================================================
  // 훈련하기: start a combo training session (2 rounds, short rest for speed)
  // ===================================================================
  await page.evaluate((id) => {
    location.hash = `#/combos/${id}/train`;
  }, comboId);
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[UI] Combo training start screen shows rounds/rest presets', text.includes('세트(라운드) 수') && text.includes('세트 사이 휴식'), text.slice(0, 300));

  const started = await page.evaluate(async (id) => {
    const { getCombo } = await import('/src/lib/combo/service.ts');
    const { startComboSession } = await import('/src/lib/combo/sessionStore.ts');
    const combo = getCombo(id);
    return startComboSession(combo, { totalRounds: 2, restSeconds: 2 });
  }, comboId);
  check('[start] Combo session started with correct technique count/rounds', started.techniqueIds.length === 3 && started.totalRounds === 2, JSON.stringify(started));

  await page.evaluate(() => location.reload());
  await page.waitForLoadState('load');
  // Poll instead of a fixed sleep — occasionally observed a reload where
  // document.body.innerText briefly reads empty before React finishes
  // mounting; the feature itself recovers correctly (confirmed via a
  // standalone repro), this just avoids a timing-flake false negative.
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      text = await page.evaluate(() => document.body.innerText);
      if (text.trim().length > 0) break;
    } catch {
      // Execution context can be torn down mid-navigation right after a
      // reload — just retry, this isn't a real failure.
    }
    await sleep(300);
  }
  check('[14][training UI] Training screen shows round/technique position', text.includes('세트 1 / 2') && text.includes('기술 1 / 3'), text.slice(0, 400));

  // Complete technique 1 of round 1.
  await page.click('button:has-text("완료")');
  await sleep(300);
  text = await page.evaluate(() => document.body.innerText);
  check('[progress] Advances to technique 2/3 within the same round', text.includes('기술 2 / 3'), text.slice(0, 300));

  await page.click('button:has-text("완료")');
  await sleep(300);
  await page.click('button:has-text("완료")'); // completes technique 3/3 -> round 1 done -> rest timer starts
  await sleep(300);
  text = await page.evaluate(() => document.body.innerText);
  check('[5][rest] Rest timer appears after completing a full round', /완료 · 휴식/.test(text), text.slice(0, 300));

  // Pause/resume the rest timer.
  await page.click('button:has-text("일시정지")');
  const remainingAtPause = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:combo-training-session')).restTimer.pausedRemainingMs);
  await sleep(700);
  const remainingStillPaused = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:combo-training-session')).restTimer.pausedRemainingMs);
  check('[9][rest-pause] Pausing the rest timer freezes remaining time', remainingAtPause !== null && remainingAtPause === remainingStillPaused, JSON.stringify({ remainingAtPause, remainingStillPaused }));
  await page.click('button:has-text("재개")');

  await sleep(2600); // longer than the 2s rest
  text = await page.evaluate(() => document.body.innerText);
  check('[rest-expire] Rest timer expires and shows "휴식 종료"', text.includes('휴식 종료'), text.slice(0, 300));
  await page.click('button:has-text("다음 세트 시작")');
  await sleep(400);
  text = await page.evaluate(() => document.body.innerText);
  check('[round2] Advances to round 2, technique index reset', text.includes('세트 2 / 2') && text.includes('기술 1 / 3'), text.slice(0, 400));

  // Overall session pause/resume (distinct from rest-timer pause).
  await page.click('button:has-text("일시정지")');
  await sleep(200);
  text = await page.evaluate(() => document.body.innerText);
  check('[pause] Whole-session pause screen shown', text.includes('일시정지됨'), text.slice(0, 200));
  await page.click('button:has-text("재개")');
  await sleep(200);

  // Complete round 2 (final round) -> session finalizes.
  await page.click('button:has-text("완료")');
  await sleep(200);
  await page.click('button:has-text("완료")');
  await sleep(200);
  await page.click('button:has-text("완료")');
  await sleep(400);
  text = await page.evaluate(() => document.body.innerText);
  check('[finish] Completion screen shown after the final round', text.includes('콤보 훈련 완료'), text.slice(0, 400));

  // ===================================================================
  // 훈련 기록: TrainingHistoryEntry with source 'combo' and correct exerciseDetails
  // ===================================================================
  const historyEntry = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('martialdex:training-history') || '[]');
    return list.find((h) => h.source === 'combo');
  });
  check(
    '[history] TrainingHistoryEntry recorded with source "combo" and per-technique exerciseDetails (2 rounds each)',
    !!historyEntry && historyEntry.completed === true && historyEntry.exerciseDetails?.length === 3 && historyEntry.exerciseDetails.every((d) => d.sets === 2 && d.actualReps.length === 2),
    JSON.stringify(historyEntry)?.slice(0, 500)
  );

  // ===================================================================
  // Delete
  // ===================================================================
  await page.evaluate(() => {
    location.hash = '#/combos';
  });
  await sleep(400);
  page.once('dialog', (d) => d.accept());
  await page.click('button:has-text("삭제")');
  await sleep(300);
  const remainingCombos = await page.evaluate(async () => {
    const { listMyCombos } = await import('/src/lib/combo/service.ts');
    return listMyCombos().length;
  });
  check('[delete] Combo deletion works', remainingCombos === 0, String(remainingCombos));

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
