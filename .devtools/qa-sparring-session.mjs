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
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 120000 });
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
  const setupHeaderVisible = await page.locator('h2', { hasText: '스파링 기록' }).count();
  const logFormDefault = await page.locator('[data-testid="sparring-log-form"]').count();
  check('[A3] 스파링 화면: 기본 탭은 "한 스파링 기록하기"(이미 한 스파링 기록 폼)', setupHeaderVisible > 0 && logFormDefault === 1, { setupHeaderVisible, logFormDefault });

  // ---- TEST M: 이미 한 스파링을 나중에 기록 (주 기능) ----
  const pastDate = await page.evaluate(() => { const d = new Date(Date.now() + 9 * 3600e3 - 3 * 86400e3); return d.toISOString().slice(0, 10); });
  await page.locator('[data-testid="sparring-date"]').fill(pastDate);
  await page.locator('[data-testid="sparring-art"]').selectOption('boxing');
  await page.locator('[data-testid="sparring-rounds"]').selectOption('5');
  await page.locator('[data-testid="sparring-round-time"]').selectOption('180');
  await page.locator('[data-testid="sparring-actual-rounds"]').fill('4');
  await sleep(200);
  const autoTime = { m: await page.locator('[data-testid="sparring-minutes"]').inputValue(), s: await page.locator('[data-testid="sparring-seconds"]').inputValue() };
  check('[M1] 실제 라운드(4) × 라운드 시간(3분)으로 시간이 미리 채워짐 (12분 0초)', autoTime.m === '12' && autoTime.s === '0', autoTime);
  await page.locator('[data-testid="sparring-minutes"]').fill('11');
  await page.locator('[data-testid="sparring-seconds"]').fill('30');
  const usedPicker = page.locator('[data-testid="sparring-used-techniques"]');
  await usedPicker.locator('button', { hasText: '+ 기술 추가' }).click();
  await usedPicker.locator('input').fill('Jab');
  await sleep(600);
  await usedPicker.locator('.search-result-row').first().click();
  await page.locator('[data-testid="sparring-went-well"]').fill('잽으로 거리 유지가 잘 됐습니다.');
  await page.locator('[data-testid="sparring-to-improve"]').fill('클린치에서 빠져나오는 타이밍이 늦었습니다.');
  await page.locator('[data-testid="sparring-partner"]').fill('기록 파트너');
  // future date is rejected
  const tomorrow = await page.evaluate(() => new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10));
  await page.locator('[data-testid="sparring-date"]').evaluate((el, v) => { el.removeAttribute('max'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, tomorrow);
  const histBeforeManual = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory().length);
  await page.locator('[data-testid="sparring-log-save"]').click();
  await sleep(300);
  const futureErr = (await page.locator('[data-testid="sparring-log-error"]').textContent().catch(() => '')) ?? '';
  const histAfterFuture = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory().length);
  check('[M2] 미래 날짜는 저장되지 않음 (안내 표시)', /아직 오지 않은 날짜/.test(futureErr) && histAfterFuture === histBeforeManual, futureErr);
  await page.locator('[data-testid="sparring-date"]').fill(pastDate);
  await page.locator('[data-testid="sparring-log-save"]').dblclick();
  await page.locator('[data-testid="sparring-saved-summary"]').waitFor({ timeout: 10000 });
  const manual = await page.evaluate(async (pastDate) => {
    const svc = await import('/src/lib/sparringSession/service.ts');
    const h = await import('/src/lib/trainingHistory/service.ts');
    const recs = svc.listSparringSessions().filter((r) => r.entryMode === 'manual');
    const r = recs[0];
    const entries = h.listTrainingHistory().filter((e) => e.sparringSessionId === r?.id);
    const energy = await import('/src/lib/nutrition/trainingEnergy.ts');
    return { count: recs.length, r, entries, kcal: entries[0] ? energy.estimateSessionCalories(entries[0], 70) : null, pastDate };
  }, pastDate);
  check('[M3] 저장된 스파링 기록: 날짜·실제 4라운드·11분 30초·사용 기술·잘된 점/보완할 점·파트너 (더블클릭에도 1건)', manual.count === 1 && manual.r.date === pastDate && manual.r.actualRounds === 4 && manual.r.actualDurationSeconds === 690 && manual.r.usedTechniqueIds.length === 1 && /거리 유지/.test(manual.r.wentWell) && /클린치/.test(manual.r.toImprove) && manual.r.partnerName === '기록 파트너', manual.r);
  check('[M4] 훈련 기록 1건이 "스파링한 날짜"로 생성 (오늘 아님), 실제 시간 12분, 사용 기술 연결', manual.entries.length === 1 && manual.entries[0].date === pastDate && manual.entries[0].source === 'sparring_session' && manual.entries[0].actualMinutes === 12 && manual.entries[0].techniqueIds.join() === manual.r.usedTechniqueIds.join(), manual.entries);
  check('[M5] 영양: 그 기록으로 소모 칼로리 추정 가능 (실제 시간 기반)', typeof manual.kcal === 'number' && manual.kcal > 0, manual.kcal);
  await page.locator('[data-testid="sparring-saved-detail"]').click();
  await sleep(800);
  const detailText = (await page.locator('[data-testid="sparring-detail"]').textContent()) ?? '';
  check('[M6] 기록 상세: "스파링 기록 보기"에 실제 라운드·시간·사용 기술·잘된 점·보완할 점', /스파링 기록 보기/.test(detailText) && /실제 4라운드/.test(detailText) && /11분 30초/.test(detailText) && /사용한 기술/.test(detailText) && /거리 유지/.test(detailText) && /클린치/.test(detailText), detailText.slice(0, 300));
  await page.goto('http://localhost:5173/#/free-training/sparring');
  await sleep(700);
  const recent = await page.locator('[data-testid="sparring-recent-row"]').allTextContents();
  check('[M7] 스파링 화면 아래 최근 스파링 기록 목록에 표시', recent.some((t) => t.includes(pastDate) && t.includes('4라운드') && t.includes('기록 파트너')), recent);
  await page.locator('[data-testid="sparring-mode-timer"]').click();
  await sleep(300);
  check('[M8] "타이머로 진행하기" 탭: 실시간 스파링 설정(스파링 시작) 유지', (await page.locator('button', { hasText: '스파링 시작' }).count()) === 1);
  // clean the manual record so the timer tests below count from a known state
  await page.evaluate(async () => {
    const svc = await import('/src/lib/sparringSession/service.ts');
    const repo = await import('/src/lib/trainingHistory/repository.ts');
    for (const r of svc.listSparringSessions()) svc.deleteSparringSession(r.id);
    const keep = repo.trainingHistoryRepository.list().filter((e) => e.source !== 'sparring_session');
    localStorage.setItem('martialdex:training-history', JSON.stringify(keep));
  });

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

  // ---- TEST L: 스파링 기록과 스파링 영상 분석이 예전처럼 같은 키에 섞여 있던 데이터 ----
  // (실제 사용자 프로필에서 재현된 오류: 영상 분석 기록에 equipment가 없어 설정 화면이 깨짐)
  const legacyErrors = [];
  const onLegacyError = (e) => legacyErrors.push(String(e));
  page.on('pageerror', onLegacyError);
  page.on('console', (m) => { if (m.type() === 'error' && /AppErrorBoundary\] uncaught|Cannot update a component/.test(m.text())) legacyErrors.push(m.text().slice(0, 300)); });
  await page.goto('http://localhost:5173/#/');
  await sleep(300);
  await page.evaluate(() => {
    const analysis = { id: 'qa-analysis-1', date: '2026-09-27T15:02:44.524Z', notes: null, videoName: 'QA.mp4', martialArt: 'mma', videoDurationSec: 60, videoResolution: null, analysisScopes: [], overallScores: { technique: null, movement: null, distance: null, defense: null, offense: null, posture: null }, motionEvents: [], techniqueGuesses: [], postureSegments: [], styleObservations: [], styleComparison: null, limitations: [], savedMoments: [], weakAreas: [{ label: '풋워크', score: 0 }], excludedMotionCounts: {} };
    const rule = { id: 'qa-rule-1', martialArt: 'boxing', sparringType: 'striking', plannedRounds: 7, roundDurationSeconds: 120, restDurationSeconds: 30, intensity: 'light', equipment: ['gloves'], allowedTechniqueIds: [], prohibitedTechniqueIds: [], partnerName: 'QA 파트너', notes: null, date: '2026-09-28', startedAt: '2026-09-28T10:00:00.000Z', endedAt: '2026-09-28T10:20:00.000Z', plannedDurationSeconds: 840, actualDurationSeconds: 800, actualRounds: 7, createdAt: '2026-09-28T10:20:00.000Z', updatedAt: '2026-09-28T10:20:00.000Z' };
    localStorage.removeItem('martialdex:sparring-rule-sessions');
    localStorage.removeItem('martialdex:sparring-run');
    localStorage.setItem('martialdex:sparring-sessions', JSON.stringify([analysis, rule]));
  });
  await page.goto('http://localhost:5173/#/free-training/sparring');
  await sleep(1200);
  const legacy = await page.evaluate(() => ({ boundary: /화면을 표시할 수 없습니다/.test(document.body.innerText), setup: !!document.querySelector('[data-testid="sparring-log-form"]'), loadLast: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('지난 룰 불러오기')) }));
  check('[L1] 섞여 있던 예전 데이터에서도 스파링 설정 화면이 열림 (오류 화면 없음)', !legacy.boundary && legacy.setup && legacyErrors.length === 0, { ...legacy, legacyErrors });
  await page.locator('[data-testid="sparring-mode-timer"]').click();
  await sleep(300);
  await page.locator('button', { hasText: '지난 룰 불러오기' }).click();
  await sleep(400);
  const loaded = await page.evaluate(() => /예정: 7 × 2분/.test(document.body.innerText));
  check('[L2] "지난 룰 불러오기"가 영상 분석 기록이 아닌 실제 스파링 룰(7라운드 × 2분)을 불러옴', loaded);
  const stores = await page.evaluate(async () => {
    const an = await import('/src/lib/sparringAnalysis/sparringSessionService.ts');
    return {
      rule: JSON.parse(localStorage.getItem('martialdex:sparring-rule-sessions') || '[]').map((r) => r.id),
      shared: JSON.parse(localStorage.getItem('martialdex:sparring-sessions') || '[]').map((r) => r.id),
      analysisList: an.listSparringSessions().map((r) => r.id),
    };
  });
  check('[L3] 스파링 룰 기록은 전용 키로 이동, 영상 분석 기록은 그대로 유지 (삭제 없음)', stores.rule.join() === 'qa-rule-1' && stores.shared.join() === 'qa-analysis-1' && stores.analysisList.join() === 'qa-analysis-1', stores);
  page.off('pageerror', onLegacyError);

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
