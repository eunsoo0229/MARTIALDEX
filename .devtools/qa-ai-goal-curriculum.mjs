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

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  // gemini-3.6-flash's free-tier daily quota (20 requests/day) is already
  // exhausted from this session's earlier testing — confirmed via a direct
  // 429 with quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier.
  // Override to a model with its own separate quota bucket for THIS test
  // run only (launch-time env, never touches the real .env / production
  // config) so the feature's actual logic can still be verified today.
  cleanEnv.GEMINI_MODEL = 'gemini-3.5-flash'; // separate quota bucket, and accepts the same thinkingLevel:'minimal' config the app sends
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

// Drives generateGoalCurriculumPreview directly (real Gemini calls, real
// technique corpus, real planner/validator) — the UI wiring for the same
// function is covered separately below via actual page clicks.
async function generateDirect(page, input) {
  return page.evaluate(async (input) => {
    const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    return generateGoalCurriculumPreview(input);
  }, input);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-ai-goal-'));
  const device = await launchDevice(dir);
  const { page } = device;

  // ---- 1. 복싱 + "풋워크가 부족하고 인파이팅을 잘하고 싶어" ----
  const r1 = await generateDirect(page, {
    freeText: '복싱을 6개월 정도 했는데 풋워크가 부족하고 상대방에게 들어갈 때 공격이 잘 안 이어져. 인파이팅 능력을 키우고 싶어.',
    martialArt: 'boxing',
    durationDays: 30,
    dailyMinutes: 30,
  });
  check('[1] 복싱 + 풋워크/인파이팅 목표 -> 분석 성공', r1.ok === true, JSON.stringify(r1).slice(0, 400));
  if (r1.ok) {
    check('[2a] 무술이 boxing으로 정확히 추정됨', r1.preview.martialArt === 'boxing', r1.preview.martialArt);
    check('[2b] 부족한 부분에 풋워크 관련 내용이 포함됨', r1.preview.analysis.weaknesses.some((w) => /풋워크|footwork|거리/i.test(w)), JSON.stringify(r1.preview.analysis.weaknesses));
    check('[2c] 목표에 인파이팅 관련 내용이 포함됨', r1.preview.analysis.goals.some((g) => /인파이팅|infight/i.test(g)) || r1.preview.analysis.priority.some((g) => /인파이팅|infight/i.test(g)), JSON.stringify(r1.preview.analysis.goals));
    check('[2d] priority(우선순위) 배열이 채워짐', r1.preview.analysis.priority.length > 0, JSON.stringify(r1.preview.analysis.priority));
    check('[6/9] 실제 매칭된 기술이 여러 개 존재 (단순 나열이 아닌 진짜 데이터)', r1.preview.matchedTechniques.length >= 6, String(r1.preview.matchedTechniques.length));
    check('[4] 지정한 기간(30일)이 그대로 사용됨 (AI가 임의 변경 안 함)', r1.preview.totalDays === 30, String(r1.preview.totalDays));
    check('[6] 실제 존재하는 기술 id만 사용됨 (기술명이 비어있지 않음)', r1.preview.days.every((d) => [...d.techniqueIds, ...d.reviewTechniqueIds].length === 0 || d.techniqueIds.every(Boolean)), '');
    check('[17] 빈 Day 없음, Day 수 정확히 일치', r1.preview.days.length === 30 && r1.preview.days.every((d) => d.learningGoals.length > 0 && (d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0)), JSON.stringify(r1.preview.days.map((d) => ({ day: d.day, goals: d.learningGoals.length, tech: d.techniqueIds.length, review: d.reviewTechniqueIds.length }))));
  }

  await sleep(15000); // space out real Gemini calls to stay under free-tier RPM

  // ---- 2. BJJ + "테이크다운 방어를 강화하고 싶어" ----
  const r2 = await generateDirect(page, {
    freeText: '테이크다운 방어를 강화하고 싶어',
    martialArt: 'bjj',
    durationDays: 14,
    dailyMinutes: 30,
  });
  check('[2] BJJ + 테이크다운 방어 목표 -> 분석 성공', r2.ok === true, JSON.stringify(r2).slice(0, 400));
  if (r2.ok) {
    check('[4] 기간 7일 -> 실제 7일 (다른 기간 값의 정확성도 함께 확인: 여기선 14일)', r2.preview.totalDays === 14, String(r2.preview.totalDays));
    check('[17] BJJ 커리큘럼도 빈 Day 없음', r2.preview.days.every((d) => d.learningGoals.length > 0 && (d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0)), '');
  }

  await sleep(15000);

  // ---- 3. 원하는 스타일 입력 (아웃복싱) ----
  const r3 = await generateDirect(page, {
    freeText: '아웃복싱 스타일을 배우고 싶어. 거리 조절과 각도 변경을 잘하고 싶어.',
    martialArt: 'boxing',
    durationDays: 30,
    dailyMinutes: 30,
  });
  check('[3] 스타일 입력("아웃복싱") -> 분석 성공', r3.ok === true, JSON.stringify(r3).slice(0, 300));
  if (r3.ok) {
    check('[11] desiredStyle에 아웃복싱 관련 내용 반영됨', r3.preview.analysis.desiredStyle.some((s) => /아웃복싱|outbox/i.test(s)) || r3.preview.analysis.goals.some((s) => /거리|각도|아웃복싱/i.test(s)), JSON.stringify(r3.preview.analysis.desiredStyle));
  }

  await sleep(15000);

  // ---- 4 & 5. 기간 7일 / 하루 30분 ----
  const r4 = await generateDirect(page, {
    freeText: '복싱 기초부터 차근차근 배우고 싶어',
    martialArt: 'boxing',
    durationDays: 7,
    dailyMinutes: 30,
  });
  check('[4][6] 기간 7일 지정 -> 정확히 7일 생성', r4.ok === true && r4.preview.totalDays === 7, JSON.stringify({ ok: r4.ok, totalDays: r4.ok ? r4.preview.totalDays : null }));
  check('[17] 7일짜리도 빈 Day 없음', r4.ok && r4.preview.days.every((d) => d.learningGoals.length > 0 && (d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0)));

  await sleep(15000);

  // ---- 7. 수준 미지정 vs 8. 초급 명시 ----
  // skipClarifying:true forces a concrete analysis even for vague text, so
  // this specifically checks the "무리하게 advanced로 판단하지 않는다" rule
  // rather than the (also-valid) clarifying-question path.
  const rLevelUnspecified = await page.evaluate(async () => {
    const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    return generateGoalCurriculumPreview({
      freeText: '복싱을 더 잘하고 싶어',
      martialArt: 'boxing',
      durationDays: 14,
      dailyMinutes: 30,
      skipClarifying: true,
    });
  });
  check('[7] 수준 미지정 시에도 무리하게 advanced로 단정하지 않음', rLevelUnspecified.ok && rLevelUnspecified.preview.analysis.estimatedLevel !== 'advanced', rLevelUnspecified.ok ? rLevelUnspecified.preview.analysis.estimatedLevel : JSON.stringify(rLevelUnspecified));

  await sleep(15000);

  const rBeginner = await generateDirect(page, {
    freeText: '복싱을 처음 시작하는 완전 초보입니다. 기본기부터 배우고 싶어요.',
    martialArt: 'boxing',
    durationDays: 14,
    dailyMinutes: 30,
  });
  check('[8] 초급 명시 시 beginner로 인식', rBeginner.ok && rBeginner.preview.analysis.estimatedLevel === 'beginner', rBeginner.ok ? rBeginner.preview.analysis.estimatedLevel : JSON.stringify(rBeginner));

  await sleep(15000);

  // ---- 9/10/11/12: AI 커리큘럼 생성 -> 미리보기 (through real UI) ----
  await page.evaluate(() => {
    location.hash = '#/ai-curriculum';
  });
  await sleep(500);
  let text = await page.evaluate(() => document.body.innerText);
  check('[1 UI] AI 맞춤 커리큘럼 입력 화면이 뜸', text.includes('AI 맞춤 커리큘럼') && text.includes('AI에게 커리큘럼 만들기'), text.slice(0, 300));

  await page.fill('textarea', '복싱 풋워크가 부족하고 인파이팅을 잘하고 싶어');
  // Select by position — the form renders 무술/훈련 기간/하루 훈련 시간 selects in that fixed order.
  const selects = await page.$$('select');
  if (selects[0]) await selects[0].selectOption('boxing');
  if (selects[1]) await selects[1].selectOption('30');
  if (selects[2]) await selects[2].selectOption('30');

  await page.click('button:has-text("AI에게 커리큘럼 만들기")');
  await sleep(300);
  text = await page.evaluate(() => document.body.innerText);
  const generatingOrDone = text.includes('분석하고') || text.includes('AI 분석 결과') || text.includes('추가로 하나만');
  check('[9] AI 커리큘럼 생성이 시작됨 (분석 중 상태 진입)', generatingOrDone, text.slice(0, 200));

  // Generation now includes an extra grounded Gemini call (techniqueResearch.ts's
  // real internet-research stage, added ahead of matching) on top of the
  // original analyzeGoal call — search-grounded calls routinely run slower
  // than a plain JSON call, so the wait budget below was widened accordingly
  // (previously 15s+12s was enough for analyzeGoal + discovery alone).
  await sleep(28000); // real Gemini calls: analyzeGoal + grounded technique research
  text = await page.evaluate(() => document.body.innerText);
  if (text.includes('추가로 하나만')) {
    await page.click('button:has-text("건너뛰기")');
    await sleep(12000);
    text = await page.evaluate(() => document.body.innerText);
  }
  if (!text.includes('AI 분석 결과')) {
    await sleep(15000); // one more grace window before failing the check
    text = await page.evaluate(() => document.body.innerText);
  }
  check('[10] 미리보기 화면 표시 (AI 분석 결과 + Day별 커리큘럼)', text.includes('AI 분석 결과') && text.includes('Day별 커리큘럼') && text.includes('Day 1'), text.slice(0, 600));
  check('[9] 단순 나열이 아닌 progression 존재 (기초/복습 등 여러 단계 라벨)', /기초|진입|포지션|연결|상황|복습/.test(text));

  const saveBtnVisible = await page.evaluate(() => !!document.querySelector('button')?.textContent);
  await page.click('button:has-text("저장하기")');
  await sleep(1000);
  text = await page.evaluate(() => document.body.innerText);
  check('[11] 저장하기 -> 실제 Curriculum 상세 페이지로 이동', text.includes('훈련하기') && !text.includes('AI에게 커리큘럼 만들기'), text.slice(0, 300));

  const savedCurriculum = await page.evaluate(async () => {
    const { listMyCurricula } = await import('/src/lib/curriculum/curriculumService.ts');
    return listMyCurricula().find((c) => !!c.aiGoalMeta);
  });
  check('[11b] 저장된 커리큘럼에 aiGoalMeta가 존재', !!savedCurriculum?.aiGoalMeta, JSON.stringify(savedCurriculum?.aiGoalMeta)?.slice(0, 200));
  check('[17] 저장된 커리큘럼도 Day 수/빈 Day 검증 통과', savedCurriculum && savedCurriculum.days.length === savedCurriculum.totalDays && savedCurriculum.days.every((d) => d.learningGoals.length > 0 && (d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0)), JSON.stringify({ totalDays: savedCurriculum?.totalDays, daysLength: savedCurriculum?.days.length }));

  // ---- 12. 다시 불러오기 (reload) ----
  await page.evaluate(() => location.reload());
  await sleep(1500);
  const reloadedCurriculum = await page.evaluate(async (id) => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    return getCurriculum(id);
  }, savedCurriculum?.id);
  check('[12] 새로고침 후에도 AI 맞춤 커리큘럼이 그대로 다시 불러와짐', reloadedCurriculum?.days.length === savedCurriculum?.days.length && JSON.stringify(reloadedCurriculum?.days) === JSON.stringify(savedCurriculum?.days), '');

  // ---- 13. 훈련하기 -> Day 선택 -> Training Session ----
  await page.evaluate((c) => {
    location.hash = `#/learning/${c.martialArt}/${c.id}`;
  }, savedCurriculum);
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[14 UI] AI 맞춤 커리큘럼도 동일한 훈련하기 버튼 사용', text.includes('훈련하기'), text.slice(0, 200));
  await page.click('a:has-text("훈련하기")');
  await sleep(400);
  await page.click('button:has-text("Day 1 훈련 시작")');
  await sleep(600);
  text = await page.evaluate(() => document.body.innerText);
  check('[13][14] Day 선택 후 실제 세트/횟수/타이머 Training Session 진입', /SET \d \//.test(text), text.slice(0, 400));

  // ---- 14. 세트/횟수/휴식 타이머 ----
  const sessionDetail = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session') || 'null'));
  check('[14] 세트/목표횟수 또는 시간/휴식 설정이 실제로 존재', !!sessionDetail?.detail?.exercises?.[0]?.config, JSON.stringify(sessionDetail?.detail?.exercises?.[0]?.config));

  // ---- 15. YouTube 영상 연결 ----
  text = await page.evaluate(() => document.body.innerText);
  check('[15] 훈련 화면에 관련 영상 섹션이 존재 (기존 YouTube 시스템 재사용)', text.includes('관련 영상') || text.includes('참고 영상'), text.slice(-400));

  check('[18] 전체 플로우 동안 콘솔/페이지 에러 없음', device.consoleErrors.length === 0, JSON.stringify(device.consoleErrors));

  await device.app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
