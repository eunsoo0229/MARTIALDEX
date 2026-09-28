// Traces the actual delete path end to end on Electron (the only platform
// this environment can drive with a real filesystem): does "삭제" in the
// 촬영 목록 remove just the localStorage record, or the real video file too?
// And — the bug this test exists to catch — if the real file deletion ever
// fails, does the app still silently report success and remove the record
// anyway (an orphaned file with zero trace), or does it now keep the
// record and surface the failure? Also confirms a video explicitly saved to
// the device gallery (MediaStore, Android-only feature) is never something
// this delete path could reach — verified by code inspection in the report,
// since Electron has no MediaStore equivalent to exercise here.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
// app.getPath('userData') derives the folder name from package.json's
// "name" ("martialdex", lowercase) unless overridden — NOT the "MARTIALDEX"
// product/display name. macOS's default filesystem is case-insensitive so
// mixing up the two still happens to resolve to the same file on disk, but
// main.cjs's video:delete handler does a case-SENSITIVE string prefix check
// against the exact value it computed — get this wrong here and every
// delete in this test fails with "경로가 올바르지 않습니다", even though
// nothing is actually broken in the app itself.
const SPARRING_VIDEOS_DIR = path.join(os.homedir(), 'Library/Application Support/martialdex/sparring-videos');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(1000);

  fs.mkdirSync(SPARRING_VIDEOS_DIR, { recursive: true });

  // Defensive cleanup in case a previous run of this same script left
  // stale rows behind (e.g. an earlier failed attempt) — repository.add()
  // always unshifts without de-duping by id, so a leftover row would
  // otherwise silently double up here.
  await page.evaluate(async () => {
    const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
    for (const v of sparringVideoRepository.list()) {
      if (v.id.startsWith('qa-delete-')) sparringVideoRepository.remove(v.id);
    }
  });

  // ---- Scenario 1: a REAL file backing a REAL record — deleting it must remove BOTH ----
  const realId = 'qa-delete-real-1';
  const realFilePath = path.join(SPARRING_VIDEOS_DIR, `${realId}.webm`);
  fs.writeFileSync(realFilePath, Buffer.from('fake webm bytes for qa'));
  check('[setup] 실제 파일이 디스크에 생성됨', fs.existsSync(realFilePath), realFilePath);

  await page.evaluate(
    async ({ id, filePath }) => {
      const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
      sparringVideoRepository.add({
        id,
        createdAt: new Date().toISOString(),
        durationSeconds: 30,
        cameraMode: 'single',
        facing: 'environment',
        localUri: filePath,
        notes: null,
      });
    },
    { id: realId, filePath: realFilePath }
  );

  const deleteResult1 = await page.evaluate(async (id) => {
    const { deleteSparringVideo } = await import('/src/lib/sparringVideo/service.ts');
    return deleteSparringVideo(id);
  }, realId);
  check('[1] deleteSparringVideo가 성공을 반환함', deleteResult1.ok === true, deleteResult1);
  check('[2] 실제 파일이 디스크에서 삭제됨(DB 레코드만 지운 게 아님)', !fs.existsSync(realFilePath), realFilePath);
  const listAfter1 = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:sparring-videos') || '[]'));
  check('[3] 촬영 목록 레코드도 함께 제거됨', !listAfter1.some((v) => v.id === realId), listAfter1.map((v) => v.id));

  // ---- Scenario 2: file already missing (e.g. manually removed) — this must still count as SUCCESS (end state achieved), not a false failure ----
  const alreadyGoneId = 'qa-delete-already-gone-1';
  const alreadyGoneFilePath = path.join(SPARRING_VIDEOS_DIR, `${alreadyGoneId}.webm`);
  // deliberately never write this file
  await page.evaluate(
    async ({ id, filePath }) => {
      const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
      sparringVideoRepository.add({
        id,
        createdAt: new Date().toISOString(),
        durationSeconds: 10,
        cameraMode: 'single',
        facing: 'environment',
        localUri: filePath,
        notes: null,
      });
    },
    { id: alreadyGoneId, filePath: alreadyGoneFilePath }
  );
  const deleteResult2 = await page.evaluate(async (id) => {
    const { deleteSparringVideo } = await import('/src/lib/sparringVideo/service.ts');
    return deleteSparringVideo(id);
  }, alreadyGoneId);
  check('[4] 파일이 이미 없는 경우도 성공으로 처리됨(force:true, 목표 상태 이미 달성)', deleteResult2.ok === true, deleteResult2);
  const listAfter2 = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:sparring-videos') || '[]'));
  check('[5] 이 경우에도 목록 레코드는 정상적으로 제거됨', !listAfter2.some((v) => v.id === alreadyGoneId), listAfter2.map((v) => v.id));

  // ---- Scenario 3: THE BUG — a record whose localUri points OUTSIDE the app's video directory. main.cjs's video:delete handler must refuse this (path-prefix safety check) — verify that refusal is now surfaced as ok:false and the record is KEPT, not silently dropped ----
  const outsideId = 'qa-delete-outside-1';
  const outsidePath = path.join(os.tmpdir(), `qa-outside-${Date.now()}.webm`);
  fs.writeFileSync(outsidePath, Buffer.from('this file must survive'));
  await page.evaluate(
    async ({ id, filePath }) => {
      const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
      sparringVideoRepository.add({
        id,
        createdAt: new Date().toISOString(),
        durationSeconds: 20,
        cameraMode: 'single',
        facing: 'environment',
        localUri: filePath,
        notes: null,
      });
    },
    { id: outsideId, filePath: outsidePath }
  );
  const deleteResult3 = await page.evaluate(async (id) => {
    const { deleteSparringVideo } = await import('/src/lib/sparringVideo/service.ts');
    return deleteSparringVideo(id);
  }, outsideId);
  check('[6] 앱 영상 디렉터리 밖의 경로는 삭제가 거부되고 ok:false로 정직하게 보고됨', deleteResult3.ok === false, deleteResult3);
  const listAfter3 = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:sparring-videos') || '[]'));
  check('[7] 삭제가 실패했으므로 목록 레코드는 그대로 남아있음(조용히 사라지지 않음)', listAfter3.some((v) => v.id === outsideId), listAfter3.map((v) => v.id));
  check('[8] 디렉터리 밖의 실제 파일은 건드리지 않고 그대로 존재함', fs.existsSync(outsidePath));

  // ---- UI-level: the "삭제" button surfaces this same failure inline instead of the card just vanishing ----
  await page.evaluate(() => {
    location.hash = '#/sparring/videos';
  });
  await sleep(700);
  page.once('dialog', (d) => d.accept());
  const deleteBtn = await page.$(`button:has-text("삭제")`);
  let uiErrorShown = false;
  if (deleteBtn) {
    await deleteBtn.click();
    await sleep(500);
    const text = await page.evaluate(() => document.body.innerText);
    uiErrorShown = text.includes('올바르지 않습니다') || text.includes('삭제하지 못했습니다');
  }
  check('[9] UI에서도 "삭제" 클릭 시 실패가 인라인 메시지로 표시됨(카드가 조용히 사라지지 않음)', uiErrorShown);

  // ---- Cleanup ----
  fs.rmSync(outsidePath, { force: true });
  await page.evaluate(async (id) => {
    const { sparringVideoRepository } = await import('/src/lib/sparringVideo/repository.ts');
    sparringVideoRepository.remove(id);
  }, outsideId);

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
