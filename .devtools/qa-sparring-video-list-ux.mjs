// Verifies this task's requirements: "촬영 목록" button reachable from the
// recording screen, file-size/preview-availability display, the 60-minute
// (and load-failure) fallback UI with its exact required banner text and
// gallery/file-move actions, and — critically — that a PRE-EXISTING record
// saved without the new fileSizeBytes field (simulating data written before
// this feature existed) still loads and renders correctly with no crash and
// no data loss. Real camera capture / real Android Intent dispatch cannot be
// driven headlessly — those are flagged "실제 기기 검증 필요" in the report,
// not claimed here.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith('http://localhost:5173'));
    if (!page) await sleep(300);
  }
  if (!page) page = await app.firstWindow();
  await page.waitForLoadState('load');
  await sleep(1000);
  return { app, page };
}
async function goto(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(700);
}

async function main() {
  const { app, page } = await launch();

  // ---- 1. "촬영 목록" button reachable from the recording screen itself (spec section 1) ----
  await goto(page, '#/sparring/record');
  await sleep(1500); // detectDualCameraSupport() probe runs first
  const recordScreenText = await page.evaluate(() => document.body.innerText);
  check('[1] 촬영 화면(메뉴)에 "촬영 목록" 버튼 존재', recordScreenText.includes('촬영 목록'));
  const listBtn = await page.$('a:has-text("촬영 목록")');
  check('[1b] "촬영 목록" 버튼이 실제 링크(anchor)로 존재', !!listBtn);
  if (listBtn) {
    const href = await listBtn.getAttribute('href');
    check('[1c] "촬영 목록" 버튼이 /sparring/videos로 연결됨', (href ?? '').includes('/sparring/videos'), href);
  }

  // ---- 2. Seed three records: normal short video, long (>60min) video, and a LEGACY record with no fileSizeBytes at all ----
  const seeded = await page.evaluate(async () => {
    const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
    const short = {
      id: 'qa-short-1',
      createdAt: new Date().toISOString(),
      durationSeconds: 90,
      cameraMode: 'single',
      facing: 'environment',
      localUri: '/Users/qa-test/Library/Application Support/MARTIALDEX/sparring-videos/qa-short-1.webm',
      notes: null,
      fileSizeBytes: 12_345_678,
    };
    const long = {
      id: 'qa-long-1',
      createdAt: new Date().toISOString(),
      durationSeconds: 3900, // 65 minutes — exceeds the 60-minute cutoff
      cameraMode: 'single',
      facing: 'user',
      localUri: '/Users/qa-test/Library/Application Support/MARTIALDEX/sparring-videos/qa-long-1.webm',
      notes: null,
      fileSizeBytes: 987_654_321,
    };
    // Deliberately mirrors a record saved BEFORE fileSizeBytes existed —
    // this is the core "기존 데이터 보존/하위 호환성" check: no fileSizeBytes
    // key at all (not even `undefined`), same shape old localStorage rows
    // actually have.
    const legacy = {
      id: 'qa-legacy-1',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      durationSeconds: 45,
      cameraMode: 'single',
      facing: 'environment',
      localUri: '/Users/qa-test/Library/Application Support/MARTIALDEX/sparring-videos/qa-legacy-1.webm',
      notes: '업데이트 이전 저장된 기존 영상',
    };
    sparringVideoRepository.add(short);
    sparringVideoRepository.add(long);
    sparringVideoRepository.add(legacy);
    return { short: short.id, long: long.id, legacy: legacy.id };
  });
  check('[setup] 일반/긴 영상/레거시(fileSizeBytes 없음) 3건 시딩', !!seeded.short && !!seeded.long && !!seeded.legacy, seeded);

  await goto(page, '#/sparring/videos');
  await sleep(700);
  let listText = await page.evaluate(() => document.body.innerText);

  // ---- 3. File size / preview-availability display ----
  check('[2] 목록에 일반 영상 파일 크기(11.8MB) 표시', listText.includes('11.8MB'), listText.match(/[\d.]+MB/g));
  check('[2b] 목록에 긴 영상 파일 크기(941.90MB 또는 0.92GB) 표시', /94[01]\.\d+MB|0\.9\dGB/.test(listText));
  check('[2c] 레거시(크기 정보 없는) 영상은 "크기 확인 불가"로 표시(크래시 없음)', listText.includes('크기 확인 불가'));
  check('[3] 일반/레거시 영상에 "✓ 미리보기 가능" 표시', (listText.match(/✓ 미리보기 가능/g) ?? []).length >= 2);
  check('[3b] 긴 영상에 "⚠ 미리보기 제한됨" 표시', listText.includes('⚠ 미리보기 제한됨'));

  // ---- 4. Long-video fallback UI — exact required banner text + both action buttons, shown WITHOUT needing a click ----
  check('[4] 긴 영상에 정확한 안내 문구 표시', listText.includes('영상 길이가 길어 미리보기가 불가할 수 있습니다.'));
  const longCardButtons = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card.info-card'));
    const longCard = cards.find((c) => c.textContent?.includes('qa-long-1') || c.textContent?.includes('영상 길이가 길어'));
    if (!longCard) return null;
    return Array.from(longCard.querySelectorAll('button')).map((b) => b.textContent?.trim());
  });
  check('[5] 긴 영상 카드에 "갤러리에서 보기" 버튼 존재', (longCardButtons ?? []).some((t) => t?.includes('갤러리에서 보기')), longCardButtons);
  check('[6] 긴 영상 카드에 "파일로 이동하기" 버튼 존재', (longCardButtons ?? []).some((t) => t?.includes('파일로 이동하기')), longCardButtons);
  check('[7] 긴 영상 카드에는 "미리보기" 버튼이 없음(억지로 로딩 시도 안 함)', !(longCardButtons ?? []).some((t) => t === '미리보기'));

  // ---- 5. Short/legacy videos still offer a normal "미리보기" button (existing behavior preserved) ----
  const shortCardHasPreviewBtn = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card.info-card'));
    const shortCard = cards.find((c) => c.textContent?.includes('qa-short-1'));
    if (!shortCard) return false;
    return Array.from(shortCard.querySelectorAll('button')).some((b) => b.textContent?.trim() === '미리보기');
  });
  check('[8] 일반 영상 카드에는 "미리보기" 버튼이 정상적으로 존재', shortCardHasPreviewBtn);

  // ---- 6. Gallery/file-move buttons don't crash on a nonexistent file path (spec: "존재하지 않는 파일에 대해서는 오류가 발생하지 않도록") ----
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  const galleryBtn = await page.$('button:has-text("갤러리에서 보기")');
  if (galleryBtn) {
    await galleryBtn.click();
    await sleep(500);
  }
  const fileMoveBtn = await page.$('button:has-text("파일로 이동하기")');
  if (fileMoveBtn) {
    await fileMoveBtn.click();
    await sleep(500);
  }
  check('[9] "갤러리에서 보기"/"파일로 이동하기" 클릭 시 앱 크래시(페이지 에러) 없음', pageErrors.length === 0, pageErrors);
  const afterClickText = await page.evaluate(() => document.body.innerText);
  check(
    '[9b] 실패 시 인라인 오류 메시지로 정직하게 표시됨(조용히 무시되지 않음)',
    afterClickText.includes('오류가 발생했습니다') || afterClickText.includes('찾을 수 없습니다') || afterClickText.includes('영상을 열 수 있는 앱을 찾지') || afterClickText.includes('잘못된 파일 경로'),
    afterClickText.length
  );

  // ---- 7. Existing trim/reveal/delete functionality on a normal video is unchanged ----
  const trimBtnStillThere = await page.evaluate(() => document.body.innerText.includes('자르기'));
  check('[10] 기존 "자르기" 기능 UI 유지됨', trimBtnStillThere);

  // ---- 8. Data-preservation check — reload the Electron window (closest headless equivalent to "재실행") and confirm ALL THREE seeded records (including the legacy one) are still present, unmodified, with the exact same localUri ----
  await page.reload();
  await sleep(1000);
  await goto(page, '#/sparring/videos');
  await sleep(700);
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:sparring-videos') || '[]'));
  const stillHasAll = ['qa-short-1', 'qa-long-1', 'qa-legacy-1'].every((id) => afterReload.some((v) => v.id === id));
  check('[11] 앱(윈도우) 재로딩 후에도 시딩한 3건 모두 그대로 남아 있음(데이터 손실 없음)', stillHasAll, afterReload.map((v) => v.id));
  const legacyAfterReload = afterReload.find((v) => v.id === 'qa-legacy-1');
  check(
    '[11b] 레거시 레코드의 localUri/기존 필드가 변경되지 않고 그대로 유지됨',
    legacyAfterReload?.localUri === '/Users/qa-test/Library/Application Support/MARTIALDEX/sparring-videos/qa-legacy-1.webm' && legacyAfterReload?.notes === '업데이트 이전 저장된 기존 영상',
    legacyAfterReload
  );
  check('[11c] 레거시 레코드는 fileSizeBytes 필드가 강제로 채워지지(재작성되지) 않음(원본 그대로)', !('fileSizeBytes' in legacyAfterReload), legacyAfterReload);

  // ---- 9. Cleanup ----
  await page.evaluate(async () => {
    const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
    for (const id of ['qa-short-1', 'qa-long-1', 'qa-legacy-1']) sparringVideoRepository.remove(id);
  });

  console.log(`\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASSED ===`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
  }

  await app.close();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
