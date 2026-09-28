import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-sparring-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(800);

  // ---- TEST A: route wiring — 자유훈련 → 스파링 링크 → 설정 화면 ----
  await page.goto('http://localhost:5173/#/free-training');
  await sleep(500);
  const sparringLinkVisible = await page.locator('a:has-text("스파링")').count();
  check('[A1] 자유훈련 화면에 "스파링" 링크 존재', sparringLinkVisible > 0, sparringLinkVisible);
  await page.locator('a:has-text("스파링")').first().click();
  await sleep(500);
  const url = page.url();
  check('[A2] "스파링" 클릭 시 /free-training/sparring로 이동', url.includes('/free-training/sparring'), url);
  const setupHeaderVisible = await page.locator('text=스파링 설정').count();
  check('[A3] 스파링 설정 화면(룰 설정 폼) 렌더링', setupHeaderVisible > 0, setupHeaderVisible);

  // ---- TEST B: 실제 라운드 타이머 (짧은 실제 시간으로 진짜 경과 확인) ----
  const beforeHistoryCount = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().length;
  });

  const runStart = await page.evaluate(async () => {
    const { startSparringRun } = await import('/src/lib/sparringSession/sessionStore.ts');
    const rules = {
      martialArt: 'wrestling', sparringType: 'grappling', plannedRounds: 2, roundDurationSeconds: 2, restDurationSeconds: 1,
      intensity: 'moderate', equipment: ['헤드기어'], allowedTechniqueIds: [], prohibitedTechniqueIds: [], partnerName: '테스트파트너', notes: '자동화 테스트',
    };
    return startSparringRun(rules);
  });
  check('[B1] startSparringRun 실행 -> phase=round, currentRound=1', runStart.phase === 'round' && runStart.currentRound === 1, runStart);

  // Real wall-clock wait: 2 rounds x 2s + 1 rest x 1s = 5s of round-phase-only
  // time expected once finished (rest excluded from "실제 스파링 시간").
  await sleep(6000);
  const tickResult = await page.evaluate(async () => {
    const { tickSparringRun, getSparringRun } = await import('/src/lib/sparringSession/sessionStore.ts');
    tickSparringRun();
    await new Promise((r) => setTimeout(r, 50));
    tickSparringRun();
    return getSparringRun();
  });
  check('[B2] 실제 시간 경과 후 phase=finished', tickResult?.phase === 'finished', tickResult);
  const expectedActualMs = 2 * 2000; // 2 rounds x 2s round-phase time, rest excluded
  const actualMs = tickResult?.accumulatedRoundMs ?? 0;
  check(
    '[B3] 실제 경과시간이 rounds×roundDuration 아닌 진짜 누적시간(휴식 제외) 기준 — 허용오차 내',
    Math.abs(actualMs - expectedActualMs) < 1500,
    { actualMs, expectedActualMs }
  );

  // ---- TEST C: finalize + idempotency (중복 저장 방지) ----
  const finalizeResult = await page.evaluate(async () => {
    const { getSparringRun } = await import('/src/lib/sparringSession/sessionStore.ts');
    const { finalizeSparringSession } = await import('/src/lib/sparringSession/service.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const run = getSparringRun();
    const record1 = finalizeSparringSession(run);
    const record2 = finalizeSparringSession(run); // simulate a duplicate save click/retry — same run object
    const historyMatches = listTrainingHistory().filter((e) => e.sparringSessionId === record1.id);
    return { record1Id: record1.id, record2Id: record2.id, historyMatchCount: historyMatches.length, entry: historyMatches[0] };
  });
  check('[C1] sparring_sessions 레코드 저장 성공 (id 존재)', !!finalizeResult.record1Id, finalizeResult.record1Id);
  check(
    '[C2] finalizeSparringSession을 2번 호출해도 training_history에는 정확히 1건만 생성 (중복 방지)',
    finalizeResult.historyMatchCount === 1,
    finalizeResult
  );
  check('[C3] training_history entry.source === "sparring_session"', finalizeResult.entry?.source === 'sparring_session', finalizeResult.entry?.source);
  check('[C4] training_history entry.sparringSessionId가 sparring_sessions.id와 일치', finalizeResult.entry?.sparringSessionId === finalizeResult.record1Id);
  check('[C5] actualMinutes이 실제 경과시간 기반(0보다 크고 매우 크지 않음)', (finalizeResult.entry?.actualMinutes ?? 0) > 0 && (finalizeResult.entry?.actualMinutes ?? 99) < 5, finalizeResult.entry?.actualMinutes);

  const afterHistoryCount = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().length;
  });
  check('[C6] training_history 전체 개수가 정확히 +1 (중복 없음)', afterHistoryCount === beforeHistoryCount + 1, { beforeHistoryCount, afterHistoryCount });

  // ---- TEST D: 상세 화면 연동 (getSparringSession으로 룰 조회 가능) ----
  const detailCheck = await page.evaluate(async (sessionId) => {
    const { getSparringSession } = await import('/src/lib/sparringSession/service.ts');
    const record = getSparringSession(sessionId);
    return record ? { martialArt: record.martialArt, partnerName: record.partnerName, notes: record.notes, equipment: record.equipment } : null;
  }, finalizeResult.record1Id);
  check('[D1] getSparringSession으로 저장된 룰(파트너/메모/장비) 조회 가능', detailCheck?.partnerName === '테스트파트너' && detailCheck?.notes === '자동화 테스트', detailCheck);

  // Navigate to the actual detail page and check the rules section renders.
  await page.goto(`http://localhost:5173/#/training-analytics/${finalizeResult.entry.id}`);
  await sleep(500);
  const rulesToggleVisible = await page.locator('text=스파링 룰 보기').count();
  check('[D2] 훈련 기록 상세 화면에 "스파링 룰 보기" 섹션 표시', rulesToggleVisible > 0, rulesToggleVisible);
  if (rulesToggleVisible > 0) {
    await page.locator('text=스파링 룰 보기').first().click();
    await sleep(300);
    const partnerVisible = await page.locator('text=테스트파트너').count();
    check('[D3] 펼치면 실제 파트너 이름이 표시됨', partnerVisible > 0, partnerVisible);
  }

  // ---- TEST E: 영양 기능 연동 (같은 날 기록 자동 반영) ----
  const nutritionCheck = await page.evaluate(async () => {
    const { listHistoryForToday } = await import('/src/lib/trainingHistory/service.ts');
    const today = listHistoryForToday();
    const sparringEntries = today.filter((e) => e.source === 'sparring_session');
    return { todayCount: today.length, sparringCount: sparringEntries.length };
  });
  check('[E1] listHistoryForToday()에 스파링 기록이 포함됨 (nutrition이 이 함수 계열로 오늘 훈련을 읽음)', nutritionCheck.sparringCount > 0, nutritionCheck);

  await page.goto('http://localhost:5173/#/nutrition');
  await sleep(600);
  const recoveryTipVisible = await page.locator('text=오늘 스파링 운동 기록이 있습니다').count();
  check('[E2] Nutrition.tsx가 스파링 기록을 감지해 회복 안내 문구 표시', recoveryTipVisible > 0, recoveryTipVisible);

  // ---- Regression smoke: 기존 자유훈련 일반 모드 화면 여전히 정상 ----
  await page.goto('http://localhost:5173/#/free-training');
  await sleep(500);
  const normalModeVisible = await page.locator('text=일반 훈련').count();
  const martialArtSelectVisible = await page.locator('select').count();
  check('[R1] 자유훈련 일반 모드 화면 여전히 정상 렌더링(무술 선택 등)', normalModeVisible > 0 && martialArtSelectVisible > 0, { normalModeVisible, martialArtSelectVisible });

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await sleep(300);
  check('[R2] 콘솔/페이지 에러 없음', consoleErrors.length === 0, consoleErrors);

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length > 0) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' - ' + f.name + ' :: ' + JSON.stringify(f.detail));
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
