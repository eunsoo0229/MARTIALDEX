// Verifies the 4 sparring-recording upgrades that don't require a real
// camera device (front-camera UI, auto-save flow's persistence functions,
// video-list location/trim/delete, and the Electron power-save-blocker IPC
// round trip). Real camera capture (getUserMedia) cannot be driven in this
// headless environment — that half is explicitly marked "실제 기기 검증 필요"
// in the final report, not claimed here.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
// app.getPath('userData') derives its folder name from package.json's
// "name" field ("martialdex", lowercase) — see qa-sparring-video-delete.mjs's
// comment on this exact gotcha (macOS's case-insensitive filesystem hides
// it, but main.cjs's video:delete does a case-SENSITIVE prefix check).
const REAL_SPARRING_VIDEOS_DIR = path.join(os.homedir(), 'Library/Application Support/martialdex/sparring-videos');

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
  await sleep(1200);
  return { app, page };
}
async function goto(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(600);
}

async function main() {
  const { app, page } = await launch();

  // ---- 1. SparringRecord.tsx ready-phase UI: front/back/dual camera choice ----
  await goto(page, '#/sparring/record');
  await sleep(1500); // detectDualCameraSupport() probe runs first
  const readyText = await page.evaluate(() => document.body.innerText);
  check('[1] 촬영 화면에 "촬영 카메라" 선택 라벨 표시', readyText.includes('촬영 카메라'));
  check('[1b] 후면 카메라 옵션 존재', readyText.includes('후면'));
  check('[1c] 전면 카메라 옵션 존재 (요청한 누락 기능)', readyText.includes('전면'));
  check('[1d] 화면 꺼짐 방지/백그라운드 계속 촬영 안내 문구 존재', readyText.includes('화면이 꺼지지 않도록') && readyText.includes('백그라운드'));
  check('[1e] 자동 저장 안내 문구 존재', readyText.includes('자동으로 저장'));

  const frontBtn = await page.$('button:has-text("🤳 전면")');
  check('[2] 전면 카메라 버튼 클릭 가능', !!frontBtn);
  if (frontBtn) {
    await frontBtn.click();
    await sleep(200);
    const isActive = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('🤳 전면'));
      return btn?.className.includes('active');
    });
    check('[2b] 전면 카메라 선택 시 active 상태로 표시됨', isActive);
  }

  // ---- 2. Electron IPC: power-save-blocker round trip (no real display-sleep assertion possible headlessly) ----
  const wakeLockResult = await page.evaluate(async () => {
    const { acquireRecordingWakeLock, releaseRecordingWakeLock } = await import('/src/lib/sparringVideo/wakeLock.ts');
    const hasIpc = !!window.martialdex?.startPowerSaveBlocker;
    await acquireRecordingWakeLock();
    await releaseRecordingWakeLock();
    return { hasIpc, ranWithoutThrowing: true };
  });
  check('[3] Electron power-save-blocker IPC 존재 및 acquire/release 정상 호출됨(예외 없음)', wakeLockResult.hasIpc && wakeLockResult.ranWithoutThrowing, wakeLockResult);

  // ---- 3. Seed a SparringVideo record directly (bypassing real camera capture, same technique as qa-sparring.mjs's session seeding) and verify the video list ----
  // A REAL file under the app's real video directory — deleteSparringVideo
  // now genuinely deletes the underlying file (see storage.ts/service.ts's
  // "정직한 삭제" fix) and only removes the record once that file deletion
  // actually succeeds, so a fake/mismatched path here would correctly be
  // REJECTED rather than removed — this test seeds a real file specifically
  // to exercise the genuine-success path, not the failure path (that's
  // qa-sparring-video-delete.mjs's job).
  fs.mkdirSync(REAL_SPARRING_VIDEOS_DIR, { recursive: true });
  const seededFilePath = path.join(REAL_SPARRING_VIDEOS_DIR, 'qa-video-1.webm');
  fs.writeFileSync(seededFilePath, Buffer.from('fake webm bytes for qa'));
  const seeded = await page.evaluate(async (filePath) => {
    const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
    const video = {
      id: 'qa-video-1',
      createdAt: new Date().toISOString(),
      durationSeconds: 120,
      cameraMode: 'single',
      facing: 'user',
      localUri: filePath,
      thumbnailDataUrl: undefined,
      notes: 'QA 테스트 영상',
    };
    sparringVideoRepository.add(video);
    return video.id;
  }, seededFilePath);
  check('[setup] 테스트용 SparringVideo 레코드 시딩', !!seeded, seeded);

  await goto(page, '#/sparring/videos');
  await sleep(700);
  const listText = await page.evaluate(() => document.body.innerText);
  check('[4] 영상 목록에 길이(2:00) 표시', listText.includes('2:00'));
  check('[4b] 영상 목록에 전면 카메라 표시', listText.includes('전면'));
  check('[4c] 영상 목록에 저장 위치(경로) 표시', listText.includes('sparring-videos/qa-video-1.webm'));
  check('[4d] "자르기" 버튼 존재', listText.includes('자르기'));

  // ---- 4. Trim editor: open, set a range, verify persisted via setSparringVideoTrim ----
  const trimBtn = await page.$('button:has-text("자르기")');
  check('[5] 자르기 버튼 클릭 가능', !!trimBtn);
  if (trimBtn) {
    await trimBtn.click();
    await sleep(300);
    const numberInputs = await page.$$('input[type="number"]');
    check('[5b] 시작/끝 초 입력 필드 2개 표시', numberInputs.length >= 2);
    if (numberInputs.length >= 2) {
      await numberInputs[0].fill('10');
      await numberInputs[1].fill('60');
      const applyBtn = await page.$('button:has-text("적용")');
      await applyBtn.click();
      await sleep(300);
    }
  }
  const afterTrim = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('martialdex:sparring-videos') || '[]');
    return list.find((v) => v.id === 'qa-video-1');
  });
  check('[5c] 자르기 구간(10~60초)이 실제로 저장됨', afterTrim?.trimStartSec === 10 && afterTrim?.trimEndSec === 60, afterTrim);

  const listAfterTrim = await page.evaluate(() => document.body.innerText);
  check('[5d] 목록에 자르기 구간이 표시됨(0:10~1:00)', listAfterTrim.includes('0:10') && listAfterTrim.includes('1:00'));

  // ---- 5. Reveal-in-folder IPC (Electron only) — confirm it's wired, not that Finder actually opened ----
  const revealResult = await page.evaluate(async () => {
    const hasReveal = !!window.martialdex?.revealVideo;
    if (hasReveal) window.martialdex.revealVideo('/nonexistent/path/for/qa.webm'); // safe no-op (path check in main.cjs)
    return hasReveal;
  });
  check('[6] "파일 위치 열기" IPC 존재 및 호출 시 예외 없음', revealResult);

  // ---- 6. Delete ----
  const deleteBtn = await page.$('button:has-text("삭제")');
  check('[7] 삭제 버튼 존재', !!deleteBtn);
  if (deleteBtn) {
    page.once('dialog', (d) => d.accept());
    await deleteBtn.click();
    await sleep(500);
  }
  const afterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:sparring-videos') || '[]'));
  check('[7b] 삭제 후 목록에서 실제로 제거됨', !afterDelete.some((v) => v.id === 'qa-video-1'), afterDelete);
  check('[7c] 삭제 후 실제 영상 파일도 디스크에서 삭제됨(DB 레코드만 지운 게 아님)', !fs.existsSync(seededFilePath), seededFilePath);

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
