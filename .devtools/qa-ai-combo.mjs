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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-aicombo-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  await page.evaluate(() => { location.hash = '#/ai-combo'; });
  await sleep(600);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[3] AI 콤비네이션 생성 화면 로드', bodyText.includes('AI 목적 기반 콤비네이션'), bodyText.slice(0, 150));

  // select MMA (real) and enter the exact spec example
  await page.evaluate(() => {
    const select = document.querySelectorAll('select.select')[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'mixed-martial-arts');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    const textarea = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, '상대를 케이지로 몰아넣고 테이크다운하고 싶어');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(200);

  const genClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('콤비네이션 생성'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  check('[3] 생성 버튼 클릭됨', genClicked, '');

  // wait up to 60s for either the analysis card or an error message
  let gotResult = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('목적 분석') || bodyText.includes('생성 중')===false && bodyText.match(/찾지 못|오류|한도/)) {
      if (bodyText.includes('목적 분석')) { gotResult = true; break; }
      if (bodyText.match(/한도|오류|찾지 못했습니다/)) break;
    }
  }
  check('[3] 분석/생성 완료 (목적 분석 표시)', gotResult, bodyText.slice(0, 500));

  if (gotResult) {
    check('[5] 목적 분석에 무술/거리/포지션/최종목적 등 항목 표시', bodyText.includes('거리') && bodyText.includes('포지션') && bodyText.includes('최종 목적'), '');
    check('[16] AI 콤비네이션 섹션 표시', bodyText.includes('AI 콤비네이션'), '');

    const stepLinks = await page.evaluate(() => [...document.querySelectorAll('.technique-row__name')].map((e) => e.textContent));
    check('[16] 최소 2단계 이상의 콤비네이션 스텝 생성됨', stepLinks.length >= 2, JSON.stringify(stepLinks));

    const discoveredBadge = bodyText.includes('새로 발견됨');
    check('[6/9 정보] 새로 발견된 기술 여부 확인(참고용, 필수 아님)', true, `discovered=${discoveredBadge}`);

    // click the first resolved step's technique link
    const clicked = await page.evaluate(() => {
      const link = document.querySelector('a.technique-row__name');
      if (link) { link.click(); return true; }
      return false;
    });
    await sleep(600);
    const urlAfterClick = await page.evaluate(() => location.href);
    check('[16] 콤비네이션 스텝 클릭 시 실제 기술 상세로 이동', clicked && /\/arts\/.+\/techniques\//.test(urlAfterClick), urlAfterClick);

    // go back and verify combo state survives (spec section 25/TEST 8)
    await page.evaluate(() => {
      const back = document.querySelector('button.back-button');
      if (back) back.click();
    });
    await sleep(600);
    bodyText = await page.evaluate(() => document.body.innerText);
    check('[25/TEST8] 기술 상세에서 돌아온 후 콤비네이션 결과가 유지됨', bodyText.includes('목적 분석') && bodyText.includes('AI 콤비네이션'), bodyText.slice(0, 300));

    // add to free training
    const addClicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '자유훈련에 추가');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
    await sleep(600);
    const urlAfterAdd = await page.evaluate(() => location.href);
    check('[18] 자유훈련에 추가 클릭 시 자유훈련 화면으로 이동', addClicked && urlAfterAdd.includes('/free-training'), urlAfterAdd);

    bodyText = await page.evaluate(() => document.body.innerText);
    const draftState = await page.evaluate(async () => {
      const mod = await import('/src/lib/freeTraining/draftStore.ts');
      return mod.readDraft();
    });
    check('[18] 콤비네이션의 기술들이 자유훈련 목록에 자동으로 추가됨(재검색 불필요)', draftState && draftState.entries.length >= 2, JSON.stringify(draftState));
  }

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
