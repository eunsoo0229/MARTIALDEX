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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-mma-curriculum-'));
  const cleanEnv = { ...process.env, GEMINI_MODEL: 'gemini-3.1-flash-lite' };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  // ---- 1. MMA 선택 + 부족한 부분 입력 -> AI 분석 -> 커리큘럼 생성 (direct service call, deterministic assertions) ----
  const weaknessResult = await page.evaluate(async () => {
    const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    return generateGoalCurriculumPreview({
      freeText: 'MMA에서 테이크다운 방어가 부족해',
      martialArt: 'mma',
      durationDays: 14,
      dailyMinutes: 30,
      refinementHistory: [],
      skipClarifying: true,
    });
  });
  check('[MMA 선택][부족한 부분 입력] 커리큘럼 생성 성공', weaknessResult.ok === true, JSON.stringify(weaknessResult).slice(0, 300));

  if (weaknessResult.ok) {
    const preview = weaknessResult.preview;
    check('[커리큘럼 생성] martialArt가 mma로 유지됨', preview.martialArt === 'mma', preview.martialArt);
    check('[커리큘럼 생성] Day 수가 요청한 14일과 일치', preview.days.length === 14, String(preview.days.length));
    check('[Day 생성][빈 Day 확인] 모든 Day에 실제 기술 또는 복습 내용이 있음(빈 Day 없음)', preview.days.every((d) => d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0), JSON.stringify(preview.days.map((d) => ({ day: d.day, tech: d.techniqueIds.length, review: d.reviewTechniqueIds.length }))));
    check('[Day 생성] 모든 Day에 학습 목표가 있음', preview.days.every((d) => d.learningGoals.length > 0), '');

    const techniqueCheck = await page.evaluate(async (ids) => {
      const { getTechnique } = await import('/src/lib/loadData.ts');
      return ids.map((id) => ({ id, exists: !!getTechnique(id) }));
    }, [...new Set(preview.days.flatMap((d) => [...d.techniqueIds, ...d.reviewTechniqueIds]))]);
    check('[기술 존재 여부 확인] 커리큘럼의 모든 기술 id가 실제 카탈로그에 존재', techniqueCheck.every((t) => t.exists), JSON.stringify(techniqueCheck.filter((t) => !t.exists)));

    const sourceArts = new Set(preview.matchedTechniques.map((m) => m.martialArt));
    check('[기존 기술 데이터 활용] 매칭된 기술이 실제 MMA 구성 무술(레슬링 등)에서 옴', [...sourceArts].some((a) => ['wrestling', 'judo', 'sambo', 'bjj', 'boxing', 'kickboxing', 'muay-thai'].includes(a)), JSON.stringify([...sourceArts]));
    check('[기존 기술 데이터 활용] 가라테/태권도는 MMA 매칭 풀에서 제외됨', ![...sourceArts].some((a) => ['karate', 'taekwondo'].includes(a)), JSON.stringify([...sourceArts]));

    // Weakness-focused: takedown-defense-relevant techniques should actually show up given the free text.
    const techniqueNames = preview.matchedTechniques.map((m) => m.techniqueName.toLowerCase());
    check('[부족한 부분 기반 커리큘럼] "테이크다운 방어" 관련 실제 기술이 매칭됨(Sprawl/Underhook/Defense 등)', techniqueNames.some((n) => n.includes('sprawl') || n.includes('underhook') || n.includes('defense') || n.includes('takedown')), JSON.stringify(techniqueNames.slice(0, 15)));

    // ---- AI 분석 (MMA area analysis) ----
    const areaAnalysis = await page.evaluate(async (matches) => {
      const { getMmaAreaAnalysis } = await import('/src/lib/mmaCurriculum/mmaAnalysis.ts');
      return getMmaAreaAnalysis(matches, 'MMA에서 테이크다운 방어가 부족해');
    }, preview.matchedTechniques);
    check('[1. MMA 전용 AI 분석] underrepresentedAreas가 실제로 채워짐', typeof areaAnalysis.underrepresentedAreas === 'string' && areaAnalysis.underrepresentedAreas.length > 0, areaAnalysis.underrepresentedAreas);
    check('[1. MMA 전용 AI 분석] breakdown이 지원 영역(Striking~Transition)만 포함', areaAnalysis.breakdown.every((b) => ['striking', 'clinch', 'takedown', 'takedown_defense', 'ground', 'submission', 'ground_and_pound', 'transition'].includes(b.area)), JSON.stringify(areaAnalysis.breakdown.map((b) => b.area)));

    // ---- Save + validate the full flow through the real UI ----
    const saved = await page.evaluate(async (preview) => {
      const { saveGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
      const c = saveGoalCurriculumPreview(preview);
      return c;
    }, preview);
    check('[저장] Curriculum이 실제 저장됨(aiGoalMeta 포함)', !!saved.id && !!saved.aiGoalMeta, saved.id);

    // ---- 커리큘럼 카드 표시 (section 8) ----
    await page.evaluate(() => { location.hash = '#/ai-curriculum'; });
    await sleep(600);
    let bodyText = await page.evaluate(() => document.body.innerText);
    check('[8. MMA 커리큘럼 표시] 내 커리큘럼 목록에 MMA 태그와 진행률 표시', bodyText.includes('MMA') && /진행률 \d+%/.test(bodyText), bodyText.slice(0, 500));

    // ---- Day list / detail labeling ----
    await page.evaluate((id) => { location.hash = `#/learning/mma/${id}`; }, saved.id);
    await sleep(600);
    bodyText = await page.evaluate(() => document.body.innerText);
    check('[8] Day 목록 화면에 "MMA · AI 맞춤 커리큘럼" 라벨 표시 (선수 스타일과 구분됨)', bodyText.includes('MMA · AI 맞춤 커리큘럼'), bodyText.slice(0, 300));

    // ---- 기술 상세 연결 ----
    const firstTeachingDay = saved.days.find((d) => d.techniqueIds.length > 0);
    await page.evaluate(({ id, dayNum }) => { location.hash = `#/learning/mma/${id}/day/${dayNum}`; }, { id: saved.id, dayNum: firstTeachingDay.day });
    await sleep(600);
    bodyText = await page.evaluate(() => document.body.innerText);
    const firstTechId = firstTeachingDay.techniqueIds[0];
    const firstTechName = await page.evaluate(async (id) => {
      const { getTechnique } = await import('/src/lib/loadData.ts');
      return getTechnique(id)?.name;
    }, firstTechId);
    check('[기술 상세 연결] Day 상세 화면에 실제 기술명이 표시됨', bodyText.includes(firstTechName), firstTechName);
    const detailLinkExists = await page.evaluate((id) => !!document.querySelector(`a[href*="${id}"]`), firstTechId);
    check('[기술 상세 연결] 기술 상세 페이지로 이동하는 링크 존재', detailLinkExists, firstTechId);

    // ---- 훈련하기 / 세트&횟수 / 휴식 타이머 / 훈련 완료 / Training Analytics ----
    await page.evaluate((id) => { location.hash = `#/learning/mma/${id}/train`; }, saved.id);
    await sleep(600);
    bodyText = await page.evaluate(() => document.body.innerText);
    check('[훈련하기] MMA 커리큘럼도 기존 "훈련하기" 화면이 정상 작동', bodyText.includes('훈련') || bodyText.includes('Day'), bodyText.slice(0, 300));

    const trainingResult = await page.evaluate(async ({ curriculumId, dayNumber, techniqueIds }) => {
      const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
      const { setDayComplete, getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
      const c = getCurriculum(curriculumId);
      const entry = recordTrainingSession({
        curriculumId,
        dayNumber,
        techniqueIds,
        completed: true,
        estimatedMinutes: 25,
        actualMinutes: 25,
        notes: null,
        source: 'curriculum',
        exerciseDetails: techniqueIds.map((id) => ({
          techniqueId: id, mode: 'reps', sets: 3, targetReps: 10, targetSeconds: null,
          actualReps: [10, 10, 10], actualSeconds: [null, null, null], restSeconds: 30, startedAt: null, finishedAt: null,
        })),
      });
      setDayComplete(c, dayNumber, true);
      return entry;
    }, { curriculumId: saved.id, dayNumber: firstTeachingDay.day, techniqueIds: firstTeachingDay.techniqueIds });
    check('[세트/횟수][휴식 타이머 데이터][훈련 완료] MMA 훈련이 기존 Training Session 구조로 기록됨', !!trainingResult.id && trainingResult.exerciseDetails[0].actualReps.join(',') === '10,10,10', JSON.stringify(trainingResult).slice(0, 200));

    // ---- Training Analytics: 기록 + 최근 훈련 ----
    await page.evaluate(() => { location.hash = '#/training-analytics'; });
    await sleep(600);
    bodyText = await page.evaluate(() => document.body.innerText);
    check('[Training Analytics 기록][최근 훈련 표시] MMA 훈련이 최근 훈련 목록에 표시됨', bodyText.includes(saved.title) || bodyText.includes('9세트'), bodyText.slice(0, 500));

    const historyCheck = await page.evaluate(async (curriculumId) => {
      const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
      return listTrainingHistory().filter((h) => h.curriculumId === curriculumId);
    }, saved.id);
    check('[Training Analytics 기록] 새로운 별도 기록 시스템이 아닌 기존 trainingHistory에 기록됨', historyCheck.length === 1, JSON.stringify(historyCheck).slice(0, 200));
  }

  // ---- 5. MMA 전체 기본기 커리큘럼 (특별한 부족한 부분 지정 없음) ----
  const basicsResult = await page.evaluate(async () => {
    const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    return generateGoalCurriculumPreview({
      freeText: 'MMA 기본기를 전체적으로 배우고 싶어',
      martialArt: 'mma',
      durationDays: 21,
      dailyMinutes: 30,
      refinementHistory: [],
      skipClarifying: true,
    });
  });
  check('[5. MMA 기본기 커리큘럼] 생성 성공', basicsResult.ok === true, JSON.stringify(basicsResult).slice(0, 300));
  if (basicsResult.ok) {
    const days = basicsResult.preview.days;
    check('[5. MMA 기본기][빈 Day 재발 방지 확인] 모든 Day에 실제 내용이 있음', days.every((d) => d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0), JSON.stringify(days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length === 0)));
    const areasUsed = new Set(basicsResult.preview.matchedTechniques.map((m) => m.martialArt));
    check('[5. MMA 기본기] 여러 실제 무술에서 균형 있게 매칭됨(타격+그래플링 모두 포함)', [...areasUsed].some((a) => ['boxing', 'kickboxing', 'muay-thai'].includes(a)) && [...areasUsed].some((a) => ['wrestling', 'judo', 'sambo', 'bjj'].includes(a)), JSON.stringify([...areasUsed]));
  }

  // ---- 6. MMA 스타일 커리큘럼 (그래플링 중심 스타일, 특정 선수 이름 없음) ----
  const styleResult = await page.evaluate(async () => {
    const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    return generateGoalCurriculumPreview({
      freeText: '그래플링이 약한 MMA 선수 스타일로 훈련하고 싶어',
      martialArt: 'mma',
      durationDays: 14,
      dailyMinutes: 30,
      refinementHistory: [],
      skipClarifying: true,
    });
  });
  check('[6. MMA 스타일 커리큘럼] 그래플링 중심 요청 생성 성공', styleResult.ok === true, JSON.stringify(styleResult).slice(0, 300));
  if (styleResult.ok) {
    check('[6. MMA 스타일] 빈 Day 없음', styleResult.preview.days.every((d) => d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0), '');
  }

  // ---- 기존 9개 무술 AI 커리큘럼 회귀 테스트 ----
  const regressionResult = await page.evaluate(async () => {
    const { generateGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    return generateGoalCurriculumPreview({
      freeText: '복싱 풋워크가 부족해',
      martialArt: 'boxing',
      durationDays: 14,
      dailyMinutes: 30,
      refinementHistory: [],
      skipClarifying: true,
    });
  });
  check('[회귀] 기존 9개 무술(복싱) AI 커리큘럼 생성 정상 작동', regressionResult.ok === true, JSON.stringify(regressionResult).slice(0, 300));
  if (regressionResult.ok) {
    check('[회귀] 복싱 커리큘럼에 복싱 외 무술 기술이 섞이지 않음(단일 무술 스코프 유지)', regressionResult.preview.matchedTechniques.every((m) => m.martialArt === 'boxing'), JSON.stringify([...new Set(regressionResult.preview.matchedTechniques.map((m) => m.martialArt))]));
    check('[회귀] 빈 Day 없음', regressionResult.preview.days.every((d) => d.techniqueIds.length > 0 || d.reviewTechniqueIds.length > 0), '');
  }

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
