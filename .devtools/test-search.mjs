import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/91b22777-cd8e-44fb-a23d-f5efab2e512e/scratchpad/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 1000));

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  async function goto(hash) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise((r) => setTimeout(r, 400));
  }

  async function rowNames() {
    return page.evaluate(() =>
      [...document.querySelectorAll('.technique-row__name')].map((el) => el.textContent?.trim())
    );
  }

  async function resultCount() {
    return page.evaluate(() => document.querySelector('.result-count')?.textContent?.trim());
  }

  console.log('\n=== TEST 1: 검색 "Armbar" (전체 기술) ===');
  await goto('#/techniques?q=Armbar');
  console.log('result count:', await resultCount());
  console.log('names (first 8):', (await rowNames()).slice(0, 8));

  console.log('\n=== TEST 2: 검색 "Juji Gatame" ===');
  await goto('#/techniques?q=Juji+Gatame');
  console.log('result count:', await resultCount());
  console.log('names:', await rowNames());

  console.log('\n=== TEST 3: 검색 "암바" (한국어) ===');
  await goto('#/techniques?q=%EC%95%94%EB%B0%94');
  console.log('result count:', await resultCount());
  console.log('names:', await rowNames());
  await page.screenshot({ path: path.join(SHOT_DIR, 'search-korean-armbar.png') });

  console.log('\n=== TEST 4: 검색 "로우킥" (한국어, 킥복싱/무에타이 로우킥) ===');
  await goto('#/techniques?q=%EB%A1%9C%EC%9A%B0%ED%82%A5');
  console.log('result count:', await resultCount());
  console.log('names (first 10):', (await rowNames()).slice(0, 10));

  console.log('\n=== TEST 5: 필터만 - 무술=judo, 난이도=beginner ===');
  await goto('#/techniques?martialArt=judo&difficulty=beginner');
  console.log('result count:', await resultCount());
  console.log('names (first 10):', (await rowNames()).slice(0, 10));

  console.log('\n=== TEST 6: 필터 - 무술=bjj, 포지션="마운트 (Mount)" ===');
  await goto('#/techniques?martialArt=bjj&position=' + encodeURIComponent('마운트 (Mount)'));
  console.log('result count:', await resultCount());
  console.log('names (first 10):', (await rowNames()).slice(0, 10));

  console.log('\n=== TEST 7: 필터 - 기술 유형(type) = #Sweep ===');
  await goto('#/techniques?type=' + encodeURIComponent('#Sweep'));
  console.log('result count:', await resultCount());
  console.log('names (first 10):', (await rowNames()).slice(0, 10));

  console.log('\n=== TEST 8: 무술 스코프 페이지(/arts/taekwondo/techniques) + 카테고리 필터 UI로 클릭 조작 ===');
  await goto('#/arts/taekwondo/techniques');
  console.log('martialArt select visible? (should be hidden, scoped by route):',
    await page.evaluate(() => document.querySelectorAll('.filter-bar select').length));
  console.log('result count (all taekwondo):', await resultCount());

  console.log('\n=== TEST 9: EMPTY STATE - 존재하지 않는 검색어 ===');
  await goto('#/techniques?q=zzzznonexistenttechniquequery');
  console.log('result count:', await resultCount());
  const emptyVisible = await page.evaluate(() => !!document.querySelector('.empty-state'));
  console.log('empty state visible:', emptyVisible);
  console.log('empty state text:', await page.evaluate(() => document.querySelector('.empty-state p')?.textContent));
  await page.screenshot({ path: path.join(SHOT_DIR, 'search-empty-state.png') });

  console.log('\n=== TEST 10: 필터 초기화 버튼 ===');
  await goto('#/techniques?q=kick&difficulty=beginner');
  const resetVisible = await page.evaluate(() => !!([...document.querySelectorAll('button')].find(b => b.textContent?.includes('필터 초기화'))));
  console.log('reset button visible with active filters:', resetVisible);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('필터 초기화'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  console.log('url hash after reset:', await page.evaluate(() => location.hash));
  console.log('result count after reset:', await resultCount());

  console.log('\n=== TEST 11: TechniqueRow shows martialArt/category/positions ===');
  await goto('#/techniques?q=Osoto+Gari');
  const rowInfo = await page.evaluate(() => {
    const row = document.querySelector('.technique-row');
    return {
      name: row?.querySelector('.technique-row__name')?.textContent,
      sub: row?.querySelector('.technique-row__sub')?.textContent,
    };
  });
  console.log('first row info:', rowInfo);
  await page.screenshot({ path: path.join(SHOT_DIR, 'search-osotogari-rows.png') });

  console.log('\n=== TEST 12: 헤더 SearchBar 드롭다운 (한/영 혼용) ===');
  await goto('#/');
  await page.evaluate(() => document.querySelector('.search-box--hero input').focus());
  await page.keyboard.type('니 온 벨리', { delay: 20 });
  await new Promise((r) => setTimeout(r, 400));
  const heroResults = await page.evaluate(() =>
    [...document.querySelectorAll('.search-result-row__name')].map((el) => el.textContent)
  );
  console.log('hero search "니 온 벨리" results:', heroResults);
  await page.screenshot({ path: path.join(SHOT_DIR, 'search-hero-korean.png') });

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  await app.close();
}

main().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
