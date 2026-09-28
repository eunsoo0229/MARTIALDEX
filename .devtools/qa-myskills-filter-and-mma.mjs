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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-mma-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  // ===== 1. loadData picked up mixed-martial-arts =====
  const summaries = await page.evaluate(async () => {
    const mod = await import('/src/lib/loadData.ts');
    return mod.martialArtSummaries.map((a) => ({ id: a.id, nameKo: a.nameKo, count: a.techniqueCount }));
  });
  check('[1] martialArtSummaries includes mixed-martial-arts', summaries.some((a) => a.id === 'mixed-martial-arts'), JSON.stringify(summaries));
  check('[1] martialArtSummaries has 10 arts total', summaries.length === 10, String(summaries.length));

  // ===== 2. 무술 목록 화면 =====
  await page.evaluate(() => { location.hash = '#/arts'; });
  await sleep(500);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[2] 무술 목록에 MMA 표시', bodyText.includes('MMA'), bodyText.slice(0, 200));

  // ===== 3. 무술 상세 + 기술 목록 =====
  await page.evaluate(() => { location.hash = '#/arts/mixed-martial-arts'; });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[3] MMA 무술 상세 페이지 로드', bodyText.includes('MMA') && !bodyText.includes('찾을 수 없'), bodyText.slice(0, 200));

  await page.evaluate(() => { location.hash = '#/arts/mixed-martial-arts/techniques'; });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[3] MMA 기술 목록에 기술이 표시됨', bodyText.includes('Range Management') || bodyText.includes('Ground and Pound') || /\d+개/.test(bodyText), bodyText.slice(0, 300));

  // ===== 4. 기술 상세 + 관련 기술(cross-art) 링크 =====
  await page.evaluate(() => { location.hash = '#/arts/mixed-martial-arts/techniques/mixed-martial-arts__level-change-double-leg'; });
  await sleep(600);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[4] MMA 기술 상세 로드', bodyText.includes('Level Change Double Leg'), bodyText.slice(0, 200));
  check('[4] 관련 기술 섹션에 크로스아트 링크 표시 (레슬링)', bodyText.includes('관련 기술') && bodyText.includes('레슬링'), bodyText.slice(bodyText.indexOf('관련 기술') - 5, bodyText.indexOf('관련 기술') + 300));

  // click into the related wrestling technique
  const clicked = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a.related-link')];
    const target = links.find((l) => l.textContent?.includes('Double Leg') || l.textContent?.includes('레슬링'));
    if (target) { target.click(); return true; }
    return false;
  });
  await sleep(500);
  const urlAfterClick = await page.evaluate(() => location.href);
  check('[4] 관련 기술 클릭 시 실제 레슬링 기술 상세로 이동', clicked && urlAfterClick.includes('/arts/wrestling/'), urlAfterClick);

  // ===== 5. 검색 =====
  await page.evaluate(() => { location.hash = '#/arts/mixed-martial-arts/techniques?q=%EA%B2%8C%EC%9D%B4%EC%9E%80'; });
  await sleep(500);
  await page.evaluate(() => { location.hash = '#/arts/mixed-martial-arts/techniques'; });
  await sleep(300);
  const searchResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/search.ts');
    return mod.searchTechniques('Ground and Pound', 10, { martialArt: 'mixed-martial-arts' }).map((t) => t.id);
  });
  check('[5] search.ts로 MMA 기술 검색 가능', searchResult.some((id) => id.startsWith('mixed-martial-arts__')), JSON.stringify(searchResult));

  // ===== 6. 숙련도 설정 =====
  await page.evaluate(() => { location.hash = '#/arts/mixed-martial-arts/techniques/mixed-martial-arts__level-change-double-leg'; });
  await sleep(600);
  const setResult = await page.evaluate(async () => {
    const mod = await import('/src/lib/skillProgress/overrideStore.ts');
    mod.setOverride('mixed-martial-arts__level-change-double-leg', 'proficient');
    const skillMod = await import('/src/lib/skillProgress/computeSkillProgress.ts');
    return skillMod.computeSkillProgress('mixed-martial-arts__level-change-double-leg');
  });
  check('[6] MMA 기술 숙련도 override 저장됨', setResult.status === 'proficient' && setResult.userOverride === 'proficient', JSON.stringify(setResult));

  // ===== 7. 나의 기술 필터 유지 (핵심 버그 수정 검증) =====
  // Real navigation only (link clicks / real <select> change events), never
  // raw `location.hash =` — that bypasses react-router's history.pushState
  // and never stamps `history.state.idx`, which would make BackButton's
  // idx-check spuriously fail in this harness even though real clicks work.
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.trim() === '나의 기술');
    if (link) link.click();
  });
  await sleep(500);
  if (!(await page.evaluate(() => location.hash.includes('/my-skills')))) {
    await page.evaluate(() => { location.hash = '#/my-skills'; });
    await sleep(500);
  }

  await page.evaluate(() => {
    const select = document.querySelectorAll('select.select')[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'wrestling');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(500);
  let urlBefore = await page.evaluate(() => location.href);
  check('[7] MySkills 필터가 URL에 반영됨', urlBefore.includes('martialArt=wrestling'), urlBefore);

  // pick the first wrestling technique row and open it via a REAL click
  const wrestlingTechId = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a.technique-row')];
    const l = links.find((a) => a.getAttribute('href')?.includes('/arts/wrestling/'));
    return l ? l.getAttribute('href') : null;
  });
  check('[7] 레슬링 필터 적용된 기술 목록 존재', !!wrestlingTechId, String(wrestlingTechId));

  if (wrestlingTechId) {
    await page.evaluate((href) => {
      const links = [...document.querySelectorAll('a.technique-row')];
      const l = links.find((a) => a.getAttribute('href') === href);
      if (l) l.click();
    }, wrestlingTechId);
    await sleep(600);
    // change mastery on the detail page
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('숙련도 변경'));
      if (btn) btn.click();
    });
    await sleep(300);
    await page.evaluate(() => {
      const options = [...document.querySelectorAll('button.choice-card')];
      const proficientBtn = options.find((b) => b.querySelector('.choice-card__title')?.textContent?.includes('숙련'));
      if (proficientBtn) proficientBtn.click();
    });
    await sleep(400);

    // go back via BackButton (navigate(-1))
    await page.evaluate(() => {
      const back = document.querySelector('button.back-button');
      if (back) back.click();
    });
    await sleep(600);
    const urlAfterBack = await page.evaluate(() => location.href);
    check('[7] 이전 버튼으로 돌아온 후 martialArt=wrestling 필터 유지됨', urlAfterBack.includes('martialArt=wrestling'), urlAfterBack);

    const rowState = await page.evaluate((href) => {
      const links = [...document.querySelectorAll('a.technique-row')];
      const l = links.find((a) => a.getAttribute('href') === href);
      return l ? l.querySelector('.technique-row__right')?.textContent : null;
    }, wrestlingTechId);
    check(
      '[7] 필터 유지된 목록에 방금 변경한 숙련도(숙련)가 함께 반영됨',
      typeof rowState === 'string' && rowState.includes('숙련') && !rowState.includes('미학습'),
      String(rowState)
    );
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
