import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') { results.push({ name, pass, detail }); console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : '')); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-freetrain-combo-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  // Build + run a quick free-training session (boxing: Jab, Cross), 1 set / 1 rep each for speed.
  await page.evaluate(() => { location.hash = '#/free-training'; });
  await sleep(500);
  await page.evaluate(() => {
    const select = document.querySelectorAll('select.select')[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'boxing');
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
  await searchAndAdd('Jab');
  await sleep(300);
  await searchAndAdd('Cross');
  await sleep(300);

  // sets=1, rest=0 for both rows to finish fast
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    document.querySelectorAll('.card.info-card').forEach((card) => {
      [...card.querySelectorAll('label.field-label')].forEach((label) => {
        const input = label.querySelector('input');
        if (!input) return;
        if (label.textContent?.includes('세트')) { setter.call(input, '1'); input.dispatchEvent(new Event('input', { bubbles: true })); }
        if (label.textContent?.includes('휴식')) { setter.call(input, '0'); input.dispatchEvent(new Event('input', { bubbles: true })); }
      });
    });
  });
  await sleep(300);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '훈련 시작');
    if (btn) btn.click();
  });
  await sleep(500);

  async function completeRepsSet(reps) {
    await page.evaluate((r) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const input = document.querySelector('input[type="number"][placeholder]');
      if (input) { setter.call(input, String(r)); input.dispatchEvent(new Event('input', { bubbles: true })); }
    }, reps);
    await sleep(200);
    return page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '세트 완료');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
  }
  await completeRepsSet(5);
  await sleep(400);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '다음 훈련');
    if (btn) btn.click();
  });
  await sleep(400);
  await completeRepsSet(5);
  await sleep(600);

  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[사전] 자유훈련 완료 화면 도달', bodyText.includes('자유훈련 완료'), bodyText.slice(0, 100));
  check('[1] "콤보로 저장" 카드가 완료 화면에 표시됨', bodyText.includes('콤보로 저장') && bodyText.includes('Jab') && bodyText.includes('Cross'), bodyText.slice(bodyText.indexOf('콤보로 저장') - 10, bodyText.indexOf('콤보로 저장') + 200));

  // fill combo name and save
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="원투 태클"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (input) { setter.call(input, 'QA 자유훈련 콤보'); input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(200);
  const saveClicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '콤보로 저장');
    if (btns[0]) { btns[0].click(); return true; }
    return false;
  });
  await sleep(400);
  check('[1] 콤보로 저장 버튼 클릭됨', saveClicked, '');

  bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 저장 완료 메시지 및 링크 표시', bodyText.includes('저장했습니다'), bodyText.slice(0, 300));

  // verify via combo service directly: techniqueIds order matches performed order (Jab, Cross)
  const comboCheck = await page.evaluate(async () => {
    const { listMyCombos } = await import('/src/lib/combo/service.ts');
    const combos = listMyCombos();
    const combo = combos.find((c) => c.name === 'QA 자유훈련 콤보');
    return combo ? { id: combo.id, techniqueIds: combo.techniqueIds, hasAiMeta: !!combo.aiComboMeta } : null;
  });
  check('[1] createCombo()로 실제 combos 저장소에 저장됨(기존 구조 재사용)', !!comboCheck, JSON.stringify(comboCheck));
  check('[1] 저장된 기술 순서가 수행한 순서(Jab -> Cross)와 동일', comboCheck?.techniqueIds[0] === 'boxing__jab' && comboCheck?.techniqueIds[1] === 'boxing__cross', JSON.stringify(comboCheck));
  check('[1] 일반 콤보(아님을 표시하는 aiComboMeta 없음) — 수동/AI 콤보와 동일한 평범한 Combo로 저장됨', comboCheck?.hasAiMeta === false, '');

  // open in the existing Combo Book editor
  await page.evaluate((id) => { location.hash = `#/combos/${id}/edit`; }, comboCheck.id);
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 기존 Combo Book 편집 화면에서 정상적으로 열림', bodyText.includes('콤보 편집') && bodyText.includes('Jab') && bodyText.includes('Cross'), bodyText.slice(0, 300));

  // edit it (rename) via the existing editor UI to prove it's a fully normal editable combo
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="원투 태클"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (input) { setter.call(input, 'QA 자유훈련 콤보 (수정됨)'); input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '저장하기');
    if (btn) btn.click();
  });
  await sleep(500);
  const renamedOk = await page.evaluate(async (id) => {
    const { getCombo } = await import('/src/lib/combo/service.ts');
    return getCombo(id)?.name;
  }, comboCheck.id);
  check('[1] 콤보 북 편집 화면에서 수정도 정상 동작', renamedOk === 'QA 자유훈련 콤보 (수정됨)', String(renamedOk));

  // train it via the existing Combo Book training screen
  await page.evaluate((id) => { location.hash = `#/combos/${id}/train`; }, comboCheck.id);
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 기존 콤보 훈련 화면에서 정상적으로 훈련 가능', !bodyText.includes('찾을 수 없') && (bodyText.includes('시작') || bodyText.includes('라운드') || bodyText.includes('Jab')), bodyText.slice(0, 300));

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
