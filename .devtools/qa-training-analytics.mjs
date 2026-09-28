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
// Matches src/lib/dateUtil.ts's todayDateKey() (KST, not UTC) — this script
// predates that fix and used to compute UTC date keys, which silently
// diverged from the app's actual "today" during the KST-midnight-to-09:00
// window (the exact bug that fix corrects). Seeding with a UTC key in that
// window used to land one day off from what the app now considers today/
// yesterday.
function kstDateKey(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-training-analytics-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  // ---- Seed two real, distinct curriculum-linked training sessions: one
  // "today" (boxing, matches the spec's own example numbers exactly: 3
  // techniques x 1 set of 10 reps = 3세트/30회), one backdated to
  // "yesterday" (wrestling, 2 techniques x 2 sets of 10 reps = 4세트/40회). ----
  const seeded = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum, ensureProgress } = await import('/src/lib/curriculum/curriculumService.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');

    let box = createCustomCurriculum({ title: '복싱 기본기', description: '', martialArt: 'boxing', visibility: 'private' });
    box = addDay(box);
    box = addTechniqueToDay(box, 1, 'boxing__jab');
    box = addTechniqueToDay(box, 1, 'boxing__cross');
    box = addTechniqueToDay(box, 1, 'boxing__hook');
    box = saveCustomCurriculum(box);
    ensureProgress(box);
    const boxDetails = ['boxing__jab', 'boxing__cross', 'boxing__hook'].map((id) => ({
      techniqueId: id, mode: 'reps', sets: 1, targetReps: 10, targetSeconds: null,
      actualReps: [10], actualSeconds: [null], restSeconds: 30, startedAt: null, finishedAt: null,
    }));
    const todayEntry = recordTrainingSession({
      curriculumId: box.id, dayNumber: 1, techniqueIds: ['boxing__jab', 'boxing__cross', 'boxing__hook'],
      completed: true, estimatedMinutes: 18, actualMinutes: 18, notes: null, source: 'curriculum', exerciseDetails: boxDetails,
    });

    let wres = createCustomCurriculum({ title: '레슬링 테이크다운', description: '', martialArt: 'wrestling', visibility: 'private' });
    wres = addDay(wres);
    wres = addTechniqueToDay(wres, 1, 'wrestling__basic-double-leg');
    wres = addTechniqueToDay(wres, 1, 'wrestling__single-leg-position');
    wres = saveCustomCurriculum(wres);
    ensureProgress(wres);
    const wresDetails = ['wrestling__basic-double-leg', 'wrestling__single-leg-position'].map((id) => ({
      techniqueId: id, mode: 'reps', sets: 2, targetReps: 10, targetSeconds: null,
      actualReps: [10, 10], actualSeconds: [null, null], restSeconds: 30, startedAt: null, finishedAt: null,
    }));
    let yesterdayEntry = recordTrainingSession({
      curriculumId: wres.id, dayNumber: 1, techniqueIds: ['wrestling__basic-double-leg', 'wrestling__single-leg-position'],
      completed: true, estimatedMinutes: 25, actualMinutes: 25, notes: null, source: 'curriculum', exerciseDetails: wresDetails,
    });

    // KST-based, matching src/lib/dateUtil.ts's todayDateKey() — a plain UTC
    // Date().toISOString() key would silently land on the wrong calendar day
    // during the KST-midnight-to-09:00 window.
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000 - 86400000);
    const yesterdayKey = kstNow.toISOString().slice(0, 10);
    const yesterdayIso = new Date(Date.now() - 86400000).toISOString();
    const list = JSON.parse(localStorage.getItem('martialdex:training-history'));
    const idx = list.findIndex((e) => e.id === yesterdayEntry.id);
    list[idx] = { ...list[idx], date: yesterdayKey, completedAt: yesterdayIso };
    localStorage.setItem('martialdex:training-history', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('martialdex:training-history-updated'));
    yesterdayEntry = list[idx];

    return { todayEntry, yesterdayEntry, boxingCurriculumId: box.id, wrestlingCurriculumId: wres.id };
  });
  check('[seed] Today (boxing) session recorded via the real recordTrainingSession()', !!seeded.todayEntry.id, JSON.stringify(seeded.todayEntry).slice(0, 200));
  check('[seed] Yesterday (wrestling) session backdated to a real prior date', seeded.yesterdayEntry.date !== seeded.todayEntry.date, seeded.yesterdayEntry.date);

  // ---- Pure logic: derivation + grouping + labels ----
  const derived = await page.evaluate(async ({ todayEntry: today, yesterdayEntry: yesterday }) => {
    const { deriveEntryMartialArt, deriveEntryCurriculumTitle, deriveEntrySetsReps, formatRelativeDateLabel, groupHistoryByDate } = await import('/src/lib/trainingAnalytics/historyView.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const all = listTrainingHistory();
    return {
      todayMartialArt: deriveEntryMartialArt(today),
      yesterdayMartialArt: deriveEntryMartialArt(yesterday),
      todayCurriculumTitle: deriveEntryCurriculumTitle(today),
      yesterdayCurriculumTitle: deriveEntryCurriculumTitle(yesterday),
      todaySetsReps: deriveEntrySetsReps(today),
      yesterdaySetsReps: deriveEntrySetsReps(yesterday),
      todayLabel: formatRelativeDateLabel(today.date),
      yesterdayLabel: formatRelativeDateLabel(yesterday.date),
      groups: groupHistoryByDate(all).map((g) => ({ label: g.label, count: g.entries.length })),
    };
  }, seeded);
  check('[1] deriveEntryMartialArt resolves boxing session correctly', derived.todayMartialArt === 'boxing', derived.todayMartialArt);
  check('[1] deriveEntryMartialArt resolves wrestling session correctly', derived.yesterdayMartialArt === 'wrestling', derived.yesterdayMartialArt);
  check('[2] Curriculum title resolved for both entries', derived.todayCurriculumTitle === '복싱 기본기' && derived.yesterdayCurriculumTitle === '레슬링 테이크다운', JSON.stringify(derived));
  check('[2] Sets/reps match spec example exactly: 3세트/30회 (boxing)', derived.todaySetsReps.totalSets === 3 && derived.todaySetsReps.totalReps === 30, JSON.stringify(derived.todaySetsReps));
  check('[2] Sets/reps match spec example exactly: 4세트/40회 (wrestling)', derived.yesterdaySetsReps.totalSets === 4 && derived.yesterdaySetsReps.totalReps === 40, JSON.stringify(derived.yesterdaySetsReps));
  check('[1] Relative date labels are 오늘/어제, not raw dates', derived.todayLabel === '오늘' && derived.yesterdayLabel === '어제', JSON.stringify(derived));
  check('[1] groupHistoryByDate groups newest-first with 오늘 group before 어제 group', derived.groups[0]?.label === '오늘' && derived.groups[1]?.label === '어제', JSON.stringify(derived.groups));

  // ---- Search + filter (pure logic) ----
  const filterTests = await page.evaluate(async () => {
    const { filterHistory } = await import('/src/lib/trainingAnalytics/historyView.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const all = listTrainingHistory();
    return {
      byTechniqueName: filterHistory(all, { query: 'Jab' }).length,
      byCurriculumName: filterHistory(all, { query: '레슬링 테이크다운' }).length,
      byMartialArt: filterHistory(all, { martialArt: 'wrestling' }).length,
      byMartialArtAll: filterHistory(all, { martialArt: 'all' }).length,
      noMatch: filterHistory(all, { query: '존재하지않는기술이름xyz' }).length,
    };
  });
  check('[검색] 기술명 검색 "Jab" -> 복싱 세션만 매칭', filterTests.byTechniqueName === 1, JSON.stringify(filterTests));
  check('[검색] 커리큘럼명 검색 -> 레슬링 세션만 매칭', filterTests.byCurriculumName === 1, JSON.stringify(filterTests));
  check('[필터] 무술별 필터(wrestling) -> 레슬링 세션만', filterTests.byMartialArt === 1, JSON.stringify(filterTests));
  check('[필터] 전체 무술 필터 -> 모든 세션', filterTests.byMartialArtAll === 2, JSON.stringify(filterTests));
  check('[검색] 존재하지 않는 검색어 -> 0건 (데이터 조작 없음)', filterTests.noMatch === 0, JSON.stringify(filterTests));

  // ---- Calendar ----
  const calendarTest = await page.evaluate(async () => {
    const { computeCalendarMonth } = await import('/src/lib/trainingAnalytics/calendarData.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const days = computeCalendarMonth(listTrainingHistory(), kstNow.getUTCFullYear(), kstNow.getUTCMonth());
    const todayKey = kstNow.toISOString().slice(0, 10);
    const yesterdayKey = new Date(kstNow.getTime() - 86400000).toISOString().slice(0, 10);
    const todayCell = days.find((d) => d.dateKey === todayKey);
    const yesterdayCell = days.find((d) => d.dateKey === yesterdayKey);
    return { todayCell, yesterdayCell, totalDays: days.length };
  });
  check('[캘린더] 오늘 날짜 셀에 실제 훈련 시간(18분) 반영', calendarTest.todayCell?.totalMinutes === 18 && calendarTest.todayCell?.intensity > 0, JSON.stringify(calendarTest.todayCell));
  if (calendarTest.yesterdayCell) {
    check('[캘린더] 어제 날짜 셀에 실제 훈련 시간(25분) 반영', calendarTest.yesterdayCell.totalMinutes === 25 && calendarTest.yesterdayCell.intensity > 0, JSON.stringify(calendarTest.yesterdayCell));
  } else {
    check('[캘린더] 어제 날짜 셀에 실제 훈련 시간(25분) 반영 (skipped: month boundary)', true, 'yesterday fell in a different month this run');
  }

  // ---- Weekly / monthly report ----
  const reportTest = await page.evaluate(async () => {
    const { computeTrainingReport } = await import('/src/lib/trainingAnalytics/report.ts');
    const weekly = computeTrainingReport('7d');
    const monthly = computeTrainingReport('30d');
    return { weekly, monthly };
  });
  check('[주간 리포트] 총 훈련 시간 = 18+25 = 43분', reportTest.weekly.totalMinutes === 43, String(reportTest.weekly.totalMinutes));
  check('[주간 리포트] 완료 세트 = 3+4 = 7', reportTest.weekly.completedSets === 7, String(reportTest.weekly.completedSets));
  check('[주간 리포트] 훈련 일수 = 2일', reportTest.weekly.trainingDays === 2, String(reportTest.weekly.trainingDays));
  check('[주간 리포트] TOP 기술에 실제 기술만 등장 (최대 3개)', reportTest.weekly.topTechniques.length > 0 && reportTest.weekly.topTechniques.length <= 3, JSON.stringify(reportTest.weekly.topTechniques));
  check('[주간 리포트] 커리큘럼 달성률에 방금 만든 두 커리큘럼 포함', reportTest.weekly.curriculumCompletionRates.some((c) => c.title === '복싱 기본기') && reportTest.weekly.curriculumCompletionRates.some((c) => c.title === '레슬링 테이크다운'), JSON.stringify(reportTest.weekly.curriculumCompletionRates));
  check('[주간 리포트] 무술별 훈련 비율에 복싱/레슬링 포함', reportTest.weekly.martialArtBreakdown.some((m) => m.martialArtId === 'boxing') && reportTest.weekly.martialArtBreakdown.some((m) => m.martialArtId === 'wrestling'), JSON.stringify(reportTest.weekly.martialArtBreakdown));
  check('[월간 리포트] 30일 기준으로도 동일 데이터 반영', reportTest.monthly.totalMinutes === 43 && reportTest.monthly.trainingDays === 2, JSON.stringify(reportTest.monthly));

  // ---- Duplicate prevention at the merge layer ----
  const dedupTest = await page.evaluate(async (todayEntry) => {
    const { trainingHistoryRepository } = await import('/src/lib/trainingHistory/repository.ts');
    const before = trainingHistoryRepository.list().length;
    const insertedCount = trainingHistoryRepository.mergeFromCloud([todayEntry]);
    const after = trainingHistoryRepository.list().length;
    return { before, after, insertedCount };
  }, seeded.todayEntry);
  check('[중복 저장 방지] 이미 존재하는 id를 다시 merge해도 새로 추가되지 않음', dedupTest.insertedCount === 0 && dedupTest.after === dedupTest.before, JSON.stringify(dedupTest));

  // ---- UI: hub page ----
  await page.evaluate(() => { location.hash = '#/training-analytics'; });
  await sleep(600);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][최근 훈련] 오늘/어제 그룹과 커리큘럼 제목이 보임', bodyText.includes('오늘') && bodyText.includes('어제') && bodyText.includes('복싱 기본기') && bodyText.includes('레슬링 테이크다운'), bodyText.slice(0, 400));
  check('[UI][세트/횟수] "3세트 / 30회"와 "4세트 / 40회"가 그대로 표시됨', bodyText.includes('3세트 / 30회') && bodyText.includes('4세트 / 40회'), '');

  // Calendar day click (today's cell specifically — avoids ambiguity when
  // both seeded days land in the same intensity bucket).
  const todayDateKey = kstDateKey(new Date());
  await page.click(`[data-date="${todayDateKey}"]`);
  await sleep(400);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][캘린더] 날짜 클릭 시 해당 날짜 훈련 목록 표시', bodyText.includes('훈련 목록'), bodyText.slice(0, 400));

  check('[UI][무술별 밸런스] 도넛 차트 렌더링(범례에 복싱/레슬링)', bodyText.includes('복싱') && bodyText.includes('레슬링') && bodyText.includes('무술별 훈련 밸런스'), '');
  check('[UI][주간/월간] 리포트 섹션과 토글 버튼 표시', bodyText.includes('주간 / 월간 리포트') && bodyText.includes('주간') && bodyText.includes('월간'), '');

  // Click monthly toggle -> numbers stay consistent (same data, 30d window).
  await page.click('button:has-text("월간")');
  await sleep(300);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][월간 토글] 월간 클릭 시 리포트 갱신, 크래시 없음', bodyText.includes('훈련 시간'), '');

  // ---- UI: click a recent-training row -> detail page ----
  await page.evaluate(() => { location.hash = '#/training-analytics'; });
  await sleep(500);
  const beforeUrl = await page.evaluate(() => location.href);
  await page.locator('.pose-history-row__main').first().click();
  await sleep(500);
  const afterUrl = await page.evaluate(() => location.href);
  check('[UI][상세보기] 훈련 항목 클릭 시 상세 페이지로 이동', afterUrl !== beforeUrl && /\/training-analytics\/[^/]+$/.test(afterUrl.split('#')[1] ?? ''), afterUrl);

  const detailText = await page.evaluate(() => document.body.innerText);
  check('[상세] 날짜/시간/무술/완료여부/훈련유형 필드 표시', detailText.includes('날짜') && detailText.includes('시간') && detailText.includes('무술') && detailText.includes('완료 여부') && detailText.includes('훈련 유형'), detailText.slice(0, 500));
  check('[상세] 데이터 없는 항목(자세 분석 결과)은 표시하지 않음(fabrication 없음)', !detailText.includes('이 날짜의 자세 분석 결과'), '');

  // ---- UI: full history list — filter + search ----
  await page.evaluate(() => { location.hash = '#/training-analytics/history'; });
  await sleep(500);
  await page.selectOption('select.select', 'wrestling');
  await sleep(300);
  let listText = await page.evaluate(() => document.body.innerText);
  check('[UI][전체기록][필터] 무술별(레슬링) 필터 적용 시 복싱 세션 숨김', listText.includes('레슬링 테이크다운') && !listText.includes('복싱 기본기'), listText.slice(0, 400));

  await page.selectOption('select.select', 'all');
  await page.fill('input[placeholder="기술명 또는 커리큘럼명 검색"]', 'Cross');
  await sleep(300);
  listText = await page.evaluate(() => document.body.innerText);
  check('[UI][전체기록][검색] "Cross" 검색 시 복싱 세션만 표시', listText.includes('복싱 기본기') && !listText.includes('레슬링 테이크다운'), listText.slice(0, 400));

  await page.fill('input[placeholder="기술명 또는 커리큘럼명 검색"]', '');
  await sleep(300);
  await page.click('button:has-text("7일")');
  await sleep(300);
  listText = await page.evaluate(() => document.body.innerText);
  check('[UI][전체기록][기간필터] 7일 필터 적용 시 두 세션 모두 표시', listText.includes('복싱 기본기') && listText.includes('레슬링 테이크다운'), listText.slice(0, 400));

  check('[regression] 전체 흐름에서 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

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
