import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

function seedCurriculum(page, id, title) {
  return page.evaluate(
    ({ id, title }) => {
      const c = {
        id,
        martialArt: 'bjj',
        title,
        description: 'qa-clipboard test',
        source: 'custom',
        visibility: 'public',
        authorName: 'QA',
        totalDays: 1,
        estimatedWeeks: 1,
        phases: [],
        days: [{ day: 1, title: 'Day 1', description: '', learningGoals: [], techniqueIds: ['bjj__armbar'], reviewTechniqueIds: [], difficulty: 'beginner', estimatedMinutes: 30 }],
        techniqueCount: 1,
        createdAt: new Date().toISOString(),
      };
      const list = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
      list.unshift(c);
      localStorage.setItem('martialdex:curricula:custom', JSON.stringify(list));
    },
    { id, title },
  );
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  execSync('pbcopy', { input: '' });

  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 900));

  let dialogFired = false;
  page.on('dialog', async (dialog) => { dialogFired = true; await dialog.dismiss(); });

  // ---- 1. Real path: modern Clipboard API (Electron main.cjs must allow
  // 'clipboard-sanitized-write'), verified against the actual OS clipboard,
  // then round-tripped through the Community import decoder. ----
  const id1 = 'custom__qa-clip-' + Date.now();
  await seedCurriculum(page, id1, 'QA 공유코드 원본');
  await page.evaluate((id) => { location.hash = `#/learning/bjj/${id}`; }, id1);
  await new Promise((r) => setTimeout(r, 600));
  await page.click('button:has-text("공유 코드 복사")');
  await new Promise((r) => setTimeout(r, 500));

  const btnText = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('복사'))?.textContent);
  check('Share button shows "복사됨 ✓" after click', btnText === '복사됨 ✓', btnText);
  check('window.prompt was never invoked (it throws in Electron)', !dialogFired);

  const clip = execSync('pbpaste').toString();
  check('Real OS clipboard holds the MDCUR1. share code', clip.startsWith('MDCUR1.'), clip.slice(0, 20));

  await page.evaluate(() => { location.hash = '#/community'; });
  await new Promise((r) => setTimeout(r, 400));
  await page.fill('textarea[placeholder*="MDCUR1"]', clip);
  await page.click('button:has-text("코드 확인")');
  await new Promise((r) => setTimeout(r, 300));
  const preview = await page.evaluate(() => document.querySelector('.curriculum-import-preview')?.textContent ?? '');
  check('Pasted code decodes back to the identical curriculum', preview.includes('QA 공유코드 원본') && preview.includes('1일') && preview.includes('1개 기술'), preview);

  // ---- 2. Legacy execCommand fallback (modern API forced to fail) ----
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('x')) }, configurable: true });
  });
  execSync('pbcopy', { input: '' });
  const id2 = 'custom__qa-clip-legacy-' + Date.now();
  await seedCurriculum(page, id2, 'QA 레거시 폴백');
  await page.evaluate((id) => { location.hash = `#/learning/bjj/${id}`; }, id2);
  await new Promise((r) => setTimeout(r, 600));
  await page.click('button:has-text("공유 코드 복사")');
  await new Promise((r) => setTimeout(r, 500));
  const legacyClip = execSync('pbpaste').toString();
  check('Legacy execCommand fallback also reaches the real OS clipboard when Clipboard API is unavailable', legacyClip.startsWith('MDCUR1.'));

  // ---- 3. Last-resort manual box (both methods forced to fail) ----
  await page.evaluate(() => { document.execCommand = () => false; });
  const id3 = 'custom__qa-clip-manual-' + Date.now();
  await seedCurriculum(page, id3, 'QA 수동 폴백');
  await page.evaluate((id) => { location.hash = `#/learning/bjj/${id}`; }, id3);
  await new Promise((r) => setTimeout(r, 600));
  await page.click('button:has-text("공유 코드 복사")');
  await new Promise((r) => setTimeout(r, 500));
  const manualState = await page.evaluate(() => {
    const falseSuccess = [...document.querySelectorAll('button')].some((b) => b.textContent.includes('복사됨'));
    const input = document.querySelector('.ai-inline-warning input');
    return { falseSuccess, manualShown: !!input, manualValueOk: input ? input.value.startsWith('MDCUR1.') : false };
  });
  check('No false "복사됨" shown when both copy methods fail', !manualState.falseSuccess);
  check('Manual copy box appears with the correct code when both methods fail', manualState.manualShown && manualState.manualValueOk);

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
