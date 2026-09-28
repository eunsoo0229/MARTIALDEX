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

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-freetrain-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  // ===== TEST 1: 자유훈련 → 레슬링 → Double Leg 추가 → Sprawl 추가 → 순서 변경 → 훈련량 설정 → 훈련 시작 → 수행 → 완료 → 저장 → 기록 조회 =====
  await page.evaluate(() => { location.hash = '#/free-training'; });
  await sleep(600);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 자유훈련 화면 로드', bodyText.includes('자유훈련'), bodyText.slice(0, 100));

  // select wrestling
  await page.evaluate(() => {
    const select = document.querySelectorAll('select.select')[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'wrestling');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);

  // search + add "Basic Double Leg"
  async function searchAndAdd(query, pickIndex = 0) {
    await page.evaluate((q) => {
      const input = [...document.querySelectorAll('input.select')].find((i) => i.getAttribute('placeholder') === '기술 이름으로 검색');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, q);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, query);
    await sleep(400);
    return page.evaluate((idx) => {
      const rows = [...document.querySelectorAll('.search-result-row')];
      if (rows[idx]) { rows[idx].click(); return true; }
      return false;
    }, pickIndex);
  }

  const added1 = await searchAndAdd('Basic Double Leg');
  await sleep(300);
  const added2 = await searchAndAdd('Sprawl');
  await sleep(300);
  check('[1] Double Leg, Sprawl 추가됨', added1 && added2, `${added1},${added2}`);

  bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 추가된 기술이 목록에 표시됨', bodyText.includes('Double Leg') && bodyText.includes('Sprawl'), '');

  // reorder: move first item down (▶ button)
  const orderBefore = await page.evaluate(() => [...document.querySelectorAll('.technique-row__name')].map((e) => e.textContent));
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === '아래로 이동');
    if (buttons[0]) buttons[0].click();
  });
  await sleep(300);
  const orderAfter = await page.evaluate(() => [...document.querySelectorAll('.technique-row__name')].map((e) => e.textContent));
  check('[1] 순서 변경(◀▶ 버튼)이 실제로 순서를 바꿈', JSON.stringify(orderBefore) !== JSON.stringify(orderAfter), `${JSON.stringify(orderBefore)} -> ${JSON.stringify(orderAfter)}`);

  // set training amount: set reps of the first exercise to 5 for a fast test
  // (number fields commit on blur, not every keystroke — see NumberField.tsx
  // — so a real user's "type then move on" is simulated with focus+blur,
  // just like a human tabbing/clicking away from the field actually would)
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    // first exercise's targetReps input
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (inputs[0]) {
      inputs[0].focus();
      setter.call(inputs[0], '2');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].blur();
    }
  });
  await sleep(300);

  // set sets=1 for both exercises to make the test fast (sets input is the 3rd number input per row typically) - just reduce rest to 0 and sets to 1 via all "세트"/"휴식" fields
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    document.querySelectorAll('.card.info-card').forEach((card) => {
      const labels = [...card.querySelectorAll('label.field-label')];
      for (const label of labels) {
        const input = label.querySelector('input');
        if (!input) continue;
        if (label.textContent?.includes('세트')) {
          input.focus();
          setter.call(input, '1');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.blur();
        }
        if (label.textContent?.includes('휴식')) {
          input.focus();
          setter.call(input, '0');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.blur();
        }
      }
    });
  });
  await sleep(300);

  // start training
  const startClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '훈련 시작');
    if (btn) { btn.click(); return true; }
    return false;
  });
  await sleep(600);
  check('[1] 훈련 시작 클릭됨', startClicked, '');

  bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 훈련 시작 후 진행률(1/2) 표시', bodyText.includes('1/2'), bodyText.slice(0, 200));

  // complete set 1 of first exercise: fill reps input and click 세트 완료
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

  const set1 = await completeRepsSet(2);
  await sleep(400);
  check('[1] 1번째 기술 세트 완료 처리', set1, '');

  // advance to next exercise if a "다음 훈련" button appears, else it may already show exercise 2
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '다음 훈련');
    if (btn) btn.click();
  });
  await sleep(400);

  const set2 = await completeRepsSet(2);
  await sleep(600);
  check('[1] 2번째 기술 세트 완료 처리', set2, '');

  bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 자유훈련 완료 화면 표시', bodyText.includes('자유훈련 완료'), bodyText.slice(0, 200));

  // ===== TEST 2 groundwork was covered above (state persistence tested separately below) =====

  // check training history contains a free_training entry
  await page.evaluate(() => { location.hash = '#/training-analytics/history'; });
  await sleep(600);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[1] 훈련 기록 조회 목록에 방금 완료한 세션이 표시됨', bodyText.includes('Sprawl') && bodyText.includes('Basic Double Leg'), bodyText.slice(0, 300));

  const entryId = await page.evaluate(async () => {
    const mod = await import('/src/lib/trainingHistory/service.ts');
    const entries = mod.listTrainingHistory();
    return entries.find((e) => e.source === 'free_training')?.id ?? null;
  });
  check('[1] trainingHistory에 free_training 출처 엔트리 존재', !!entryId, String(entryId));
  if (entryId) {
    await page.evaluate((id) => { location.hash = `#/training-analytics/${id}`; }, entryId);
    await sleep(500);
    bodyText = await page.evaluate(() => document.body.innerText);
    check('[1] 훈련 기록 상세 화면에 "자유훈련" 출처로 표시됨', bodyText.includes('자유훈련'), bodyText.slice(0, 400));
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
