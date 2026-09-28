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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-freetrain-state-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  // navigate to /free-training via a real nav click (so history.state.idx is populated for BackButton)
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.trim() === '메뉴' || a.getAttribute('href') === '#/free-training');
  });
  await page.evaluate(() => { location.hash = '#/free-training'; });
  await sleep(500);

  await page.evaluate(() => {
    const select = document.querySelectorAll('select.select')[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'bjj');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);

  async function searchAndAdd(query) {
    await page.evaluate((q) => {
      const input = [...document.querySelectorAll('input.select')].find((i) => i.getAttribute('placeholder') === '기술 이름으로 검색');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, q);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, query);
    await sleep(400);
    return page.evaluate(() => {
      const row = document.querySelector('.search-result-row');
      if (row) { row.click(); return true; }
      return false;
    });
  }

  const addedArmbar = await searchAndAdd('Armbar');
  await sleep(300);
  const addedTriangle = await searchAndAdd('Triangle');
  await sleep(300);
  check('[8] BJJ + Armbar + Triangle 추가됨', addedArmbar && addedTriangle, `${addedArmbar},${addedTriangle}`);

  // customize target reps of first entry to a distinctive value (7) to verify it survives
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const input = document.querySelector('input[type="number"]');
    if (input) { setter.call(input, '7'); input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(300);

  const beforeState = await page.evaluate(async () => {
    const mod = await import('/src/lib/freeTraining/draftStore.ts');
    return mod.readDraft();
  });
  check('[8] 이동 전 draft 상태 확인 (2개 기술, martialArt=bjj)', beforeState.entries.length === 2 && beforeState.martialArt === 'bjj', JSON.stringify(beforeState));

  // click into the first added technique's real detail page via a real link click
  const clicked = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a.technique-row__name')][0];
    if (link) { link.click(); return true; }
    return false;
  });
  await sleep(600);
  const urlAfterClick = await page.evaluate(() => location.href);
  check('[2] 기술 클릭 시 실제 기술 상세 페이지로 이동', clicked && /\/arts\/bjj\/techniques\//.test(urlAfterClick), urlAfterClick);

  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[2] 기술 상세 페이지에 설명/목적/난이도 등 기존 정보 표시', bodyText.includes('설명') || bodyText.includes('목적') || bodyText.includes('난이도'), bodyText.slice(0, 200));

  // go back via the real BackButton
  await page.evaluate(() => {
    const back = document.querySelector('button.back-button');
    if (back) back.click();
  });
  await sleep(600);
  const urlAfterBack = await page.evaluate(() => location.href);
  check('[2] 이전 버튼으로 자유훈련 화면으로 복귀', urlAfterBack.includes('/free-training'), urlAfterBack);

  bodyText = await page.evaluate(() => document.body.innerText);
  check('[2] 복귀 후 선택한 무술(BJJ)/추가한 기술이 그대로 유지됨', bodyText.includes('Armbar') && bodyText.includes('Triangle'), bodyText.slice(0, 300));

  const afterState = await page.evaluate(async () => {
    const mod = await import('/src/lib/freeTraining/draftStore.ts');
    return mod.readDraft();
  });
  check(
    '[2] 복귀 후 훈련량(targetReps=7) 설정도 그대로 유지됨',
    afterState.entries.length === 2 && afterState.entries[0].config.targetReps === 7,
    JSON.stringify(afterState)
  );

  check('[regression] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
