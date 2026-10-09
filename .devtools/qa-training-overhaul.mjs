// QA: 회복도(주동근/보조근) · 볼륨 변화율 · 헬스/무술 통계 분리 · Ground Battle 삭제 ·
// 스파링 근거 기반 코칭 · 커리큘럼 삭제(검증/롤백/재실행). Requires Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const SHOT_DIR = process.env.SHOT_DIR;
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (!pass && detail ? ' :: ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(dir) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(800);
  return { app, page };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-overhaul-'));
  let { app, page } = await launch(dir);
  const errors = [];
  const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));
  watch(page);
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await sleep(800);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const shot = async (n) => SHOT_DIR && page.screenshot({ path: path.join(SHOT_DIR, n + '.png'), fullPage: true });

  // ===================== 1. 회복도 =====================
  const rec = await page.evaluate(async () => {
    const { computeAllBodyPartRecovery } = await import('/src/lib/gymTraining/recovery.ts');
    const now = new Date('2026-10-05T12:00:00Z');
    let n = 0;
    const entry = (hoursAgo, exercises) => ({
      id: 'e' + n++,
      date: '2026-10-05',
      completedAt: new Date(now.getTime() - hoursAgo * 3600000).toISOString(),
      curriculumId: null, dayNumber: null, techniqueIds: exercises.map((e) => e.id), completed: true, estimatedMinutes: 10, actualMinutes: 10, notes: null, source: 'coach_today',
      exerciseDetails: exercises.map((e) => ({
        techniqueId: e.id, mode: 'reps', sets: e.w.length, targetReps: 8, targetSeconds: null,
        actualReps: e.w.map(() => 8), actualSeconds: e.w.map(() => null), restSeconds: 90, startedAt: null, finishedAt: null,
        actualWeightKg: e.w, actualCalculatedWeightKg: e.w, ...(e.rpe ? { actualRpe: e.w.map(() => e.rpe) } : {}),
      })),
    });
    const get = (entries, part) => computeAllBodyPartRecovery(entries, now).find((r) => r.bodyPart === part);
    const BENCH = 'gym-벤치프레스', OHP = 'gym-오버헤드-프레스', CALF = 'gym-덤벨-카프-레이즈';
    const out = {};
    const one = [entry(0, [{ id: BENCH, w: [100] }])];
    out.oneSet = { chest: get(one, 'chest').recoveryPercent, triceps: get(one, 'triceps').recoveryPercent, shoulders: get(one, 'shoulders').recoveryPercent };
    const four = [entry(0, [{ id: BENCH, w: [100, 100, 100, 100] }])];
    out.fourSets = { chest: get(four, 'chest').recoveryPercent, triceps: get(four, 'triceps').recoveryPercent };
    const ten = [entry(0, [{ id: BENCH, w: Array(10).fill(100), rpe: 7 }])];
    out.tenSets = { chest: get(ten, 'chest').recoveryPercent, triceps: get(ten, 'triceps').recoveryPercent };
    // Heavy vs light: same 4 sets; best ever = 100kg (from another older entry).
    const best = entry(200, [{ id: BENCH, w: [100] }]);
    out.heavy = get([best, entry(0, [{ id: BENCH, w: [100, 100, 100, 100] }])], 'chest').recoveryPercent;
    out.light = get([best, entry(0, [{ id: BENCH, w: [50, 50, 50, 50] }])], 'chest').recoveryPercent;
    // Primary-only exercise: calf raise touches calves only.
    const calf = [entry(0, [{ id: CALF, w: [20, 20, 20] }])];
    out.calfOnly = computeAllBodyPartRecovery(calf, now).filter((r) => r.status !== 'no_data').map((r) => r.bodyPart);
    // Same secondary (triceps) from two exercises adds up.
    out.tricepsBenchOnly = get([entry(0, [{ id: BENCH, w: [100, 100, 100] }])], 'triceps').recoveryPercent;
    out.tricepsBoth = get([entry(0, [{ id: BENCH, w: [100, 100, 100] }, { id: OHP, w: [50, 50, 50] }])], 'triceps').recoveryPercent;
    // Decay: 4 sets 72h ago → fully recovered.
    out.decayed = get([entry(72, [{ id: BENCH, w: [100, 100, 100, 100] }])], 'chest');
    out.midway = get([entry(12, [{ id: BENCH, w: [100, 100, 100, 100] }])], 'chest').recoveryPercent;
    out.allClamped = computeAllBodyPartRecovery([...ten, ...ten, ...ten], now).every((r) => Number.isFinite(r.recoveryPercent) && r.recoveryPercent >= 0 && r.recoveryPercent <= 100);
    return out;
  });
  check('[R1] 1세트만: 주동근 가슴 90%, 보조근 삼두/어깨 95% (0% 아님)', rec.oneSet.chest === 90 && rec.oneSet.triceps === 95 && rec.oneSet.shoulders === 95, JSON.stringify(rec.oneSet));
  check('[R2] 여러 세트(4): 가슴 60%, 삼두 80% — 보조근 피로는 주동근의 절반', rec.fourSets.chest === 60 && rec.fourSets.triceps === 80, JSON.stringify(rec.fourSets));
  check('[R3] 10세트 RPE7: 가슴 0%(완전 피로), 삼두 50%', rec.tenSets.chest === 0 && rec.tenSets.triceps === 50, JSON.stringify(rec.tenSets));
  check('[R4] 높은 중량 > 낮은 중량 피로 (100kg 60% vs 50kg 68%)', rec.heavy === 60 && rec.light === 68, `heavy=${rec.heavy} light=${rec.light}`);
  check('[R5] 주동근만 쓰는 운동(카프)은 종아리만 영향', JSON.stringify(rec.calfOnly) === '["calves"]', JSON.stringify(rec.calfOnly));
  check('[R6] 여러 운동의 같은 보조근(삼두) 피로 누적', rec.tricepsBoth < rec.tricepsBenchOnly, `bench=${rec.tricepsBenchOnly} both=${rec.tricepsBoth}`);
  check('[R7] 시간 경과 회복: 72시간 후 100% recovered, 12시간 후 중간값', rec.decayed.recoveryPercent === 100 && rec.decayed.status === 'recovered' && rec.midway > 60 && rec.midway < 100, JSON.stringify({ d: rec.decayed.recoveryPercent, m: rec.midway }));
  check('[R8] 과도한 누적에도 0-100 범위 유지', rec.allClamped);

  // ===================== 2. 볼륨 변화율 =====================
  const vol = await page.evaluate(async () => {
    const cmp = await import('/src/lib/gymTraining/weightComparison.ts');
    const past = {
      id: 'p', date: '2026-10-01', completedAt: '2026-10-01T10:00:00Z', curriculumId: null, dayNumber: null, techniqueIds: ['gym-바벨-백스쿼트'], completed: true, estimatedMinutes: 10, actualMinutes: 10, notes: null, source: 'coach_today',
      exerciseDetails: [{ techniqueId: 'gym-바벨-백스쿼트', mode: 'reps', sets: 3, targetReps: 5, targetSeconds: null, actualReps: [5, 5, 5], actualSeconds: [null, null, null], restSeconds: 90, startedAt: null, finishedAt: null, actualWeightKg: [100, 100, 100], actualCalculatedWeightKg: [100, 100, 100] }],
    };
    const rec = cmp.listPastWeightRecords('gym-바벨-백스쿼트', undefined, [past])[0];
    return {
      total: rec.totalVolumeKg,
      weight: cmp.compareLoad(90, rec, 0).percent,
      volFull: cmp.compareVolume([720, 720, 720], rec),
      volMid: cmp.compareVolume([720], rec),
      fmt: cmp.formatChangePercent(cmp.compareVolume([720, 720, 720], rec).percent),
      sixty: cmp.listPastWeightRecords('gym-바벨-백스쿼트', undefined, [{ ...past, exerciseDetails: [{ ...past.exerciseDetails[0], actualReps: [10, 10, 8], actualWeightKg: [60, 60, 60], actualCalculatedWeightKg: [60, 60, 60] }] }])[0].totalVolumeKg,
    };
  });
  check('[V1] 볼륨 = Σ(중량×반복) (60×10+60×10+60×8 = 1680)', vol.sixty === 1680, String(vol.sixty));
  check('[V2] 중량 감소(100→90 = -10%) 이지만 볼륨 증가(1500→2160 = +44%) — 별개 지표', vol.weight === -10 && vol.volFull.percent === 44 && vol.volFull.basis === 'total' && vol.fmt === '▲ +44.0%', JSON.stringify(vol));
  check('[V3] 진행 중(1세트)에는 과거 첫 1세트(500kg) 기준으로 비교', vol.volMid.basis === 'sameSets' && vol.volMid.previousKg === 500 && vol.volMid.percent === 44, JSON.stringify(vol.volMid));

  // UI: today's routine + past squat sessions → volume block visible.
  await page.evaluate(async () => {
    const svc = await import('/src/lib/gymRoutine/service.ts');
    const { getKstWeekday, todayDateKey, shiftDateKeyDays } = await import('/src/lib/dateUtil.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    let r = svc.createGymRoutine('QA 볼륨');
    r = svc.addExerciseToDay(r, getKstWeekday(), { techniqueId: 'gym-바벨-백스쿼트', targetSets: 3, targetReps: [8, 8, 8], targetSeconds: null, targetWeightKg: [90, 90, 90], restSeconds: 0 });
    svc.setActiveGymRoutine(r.id);
    for (const [ago, w, reps] of [[2, 100, 5], [7, 95, 5], [31, 90, 5]]) {
      recordTrainingSession({
        date: shiftDateKeyDays(todayDateKey(), -ago), curriculumId: null, dayNumber: null, techniqueIds: ['gym-바벨-백스쿼트'], completed: true, estimatedMinutes: 10, source: 'coach_today',
        exerciseDetails: [{ techniqueId: 'gym-바벨-백스쿼트', mode: 'reps', sets: 3, targetReps: 5, targetSeconds: null, actualReps: [reps, reps, reps], actualSeconds: [null, null, null], restSeconds: 90, startedAt: null, finishedAt: null, actualWeightKg: [w, w, w], actualCalculatedWeightKg: [w, w, w] }],
      });
    }
  });
  await goto('#/today-training');
  await page.locator('button:has-text("훈련 시작")').first().click();
  await sleep(700);
  let t = await text();
  // set 1: 90×8 = 720 vs last session first set 100×5 = 500 → +44%; weight 90 vs 100 = -10%
  check('[V4] UI: 중량 ▼ -10.0% 와 총 볼륨 ▲ +44.0% 를 따로 표시', /▼ -10\.0%\s*지난 운동\s*100kg/.test(t) && /총 볼륨\s*720kg/.test(t) && /▲ \+44\.0%\s*지난 운동\s*500kg/.test(t), t.slice(0, 1400));
  await shot('v-volume');
  await page.evaluate(async () => (await import('/src/lib/todayTraining/sessionStore.ts')).clearTodaySession());

  // ===================== 3. 헬스/무술 통계 분리 =====================
  const stats = await page.evaluate(async () => {
    const { searchTechniques } = await import('/src/lib/search.ts');
    const { recordTrainingSession, listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const { computeTrainingReport } = await import('/src/lib/trainingAnalytics/report.ts');
    const jab = searchTechniques('jab', 1, { martialArt: 'boxing' })[0];
    for (let i = 0; i < 5; i++) recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: [jab.id], completed: true, estimatedMinutes: 10, source: 'free_training' });
    for (let i = 0; i < 2; i++) recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['gym-벤치프레스'], completed: true, estimatedMinutes: 10, source: 'coach_today' });
    const r = computeTrainingReport('30d', listTrainingHistory());
    return { jabName: jab.koreanName || jab.name, top: r.topTechniques, gym: r.topGymExercises };
  });
  check('[S1] 무술 TOP에는 헬스 운동 없음', stats.top.length > 0 && stats.top.every((x) => !x.techniqueId.startsWith('gym-')) && stats.top[0].count === 5, JSON.stringify(stats.top));
  check('[S2] 헬스 TOP에는 헬스 운동만 (스쿼트 3, 벤치 2)', stats.gym.length > 0 && stats.gym.every((x) => x.techniqueId.startsWith('gym-')) && stats.gym[0].name.includes('스쿼트') && stats.gym[0].count === 3, JSON.stringify(stats.gym));
  await goto('#/training-analytics');
  t = await text();
  check('[S3] UI: "🥋 가장 많이 훈련한 기술" / "🏋️ 가장 많이 훈련한 헬스" 별도 표시', t.includes('🥋 가장 많이 훈련한 기술') && t.includes('🏋️ 가장 많이 훈련한 헬스') && t.includes(`${stats.jabName} — 5회`), t.slice(0, 1500));

  // ===================== 4. Ground Battle 삭제 =====================
  await goto('#/free-training/ground-battle');
  t = await text();
  check('[G1] /free-training/ground-battle 라우트 제거 (NotFound)', t.includes('페이지를 찾을 수 없습니다'));
  await goto('#/free-training');
  t = await text();
  check('[G2] 자유 훈련에 그라운드 배틀 진입 버튼 없음 / 스파링 기록은 유지', !t.includes('그라운드 배틀') && t.includes('스파링 기록'));
  const gbEntry = await page.evaluate(async () => {
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    return recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: [], completed: true, estimatedMinutes: 5, source: 'ground_battle', notes: '그라운드 배틀 · 과거 기록' }).id;
  });
  await goto(`#/training-analytics/${gbEntry}`);
  t = await text();
  check('[G3] 과거 ground_battle 기록 상세가 크래시 없이 표시', t.includes('그라운드 배틀 (지난 기록)') && !t.includes('그라운드 배틀 기록 보기'));
  const keysGone = await page.evaluate(() => localStorage.getItem('martialdex:ground-battle-matches') === null && localStorage.getItem('martialdex:ground-battle-run') === null);
  check('[G4] Ground Battle localStorage 키 정리', keysGone);

  // ===================== 5. 스파링 근거 기반 코칭 =====================
  const sp = await page.evaluate(async () => {
    const cs = await import('/src/lib/sparringAnalysis/coachingSynthesis.ts');
    const { searchTechniques } = await import('/src/lib/search.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const jab = searchTechniques('jab', 1, { martialArt: 'boxing' })[0];
    const cross = searchTechniques('cross', 1, { martialArt: 'boxing' })[0];
    recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: [cross.id], completed: true, estimatedMinutes: 10, source: 'free_training' }); // learned
    const ev = (t, category) => ({ timestampSec: t, category, label: '', confidence: 'medium' });
    const input = {
      martialArt: 'boxing',
      techniqueGuesses: [{ techniqueId: jab.id, techniqueName: 'Jab', martialArt: 'boxing', occurrences: [2, 10, 20, 30], estimated: true }],
      motionEvents: [ev(2, 'strike_like'), ev(10, 'strike_like'), ev(20, 'strike_like'), ev(30, 'strike_like'), ev(35, 'footwork_movement'), ev(50, 'distance_exit_like'), ev(55, 'guard_hold_like')],
      opponentMotionEvents: [],
      visualInsights: [],
      postureSegments: [
        { segment: 'early', label: '초반', metrics: [{ id: 'guard', label: '가드', score: 74, status: 'good' }], note: null },
        { segment: 'late', label: '후반', metrics: [{ id: 'guard', label: '가드', score: 52, status: 'needs_improvement' }], note: null },
      ],
      styleObservations: [],
      weakAreas: [{ label: '가드', score: 52 }],
      videoDurationSec: 60,
    };
    const prepared = cs.prepareCoaching(input);
    const guardFact = prepared.facts.find((f) => f.text.startsWith('가드 점수'));
    const raw = {
      strengths: [{ label: '잽을 꾸준히 사용했어요.', factIds: [prepared.facts.find((f) => f.text.startsWith('Jab')).id] }, { label: '체력이 좋았어요.', factIds: [] }, { label: '없는 근거', factIds: ['F999'] }],
      weaknesses: [{ label: '후반에 가드가 낮아졌어요.', factIds: [guardFact.id] }],
      patternDiagnoses: [{ patternIndex: 99, diagnosis: '가짜' }],
      categoryScores: { attack: 70, defense: 60, footwork: 50, distance: 40, timing: 50, connection: 80, tacticalVariety: 60 },
      nextTraining: [
        { title: '가드 복귀', drill: 'Jab → Cross 후 가드 복귀 10회 × 3세트', reason: '후반 가드 하락', factIds: [guardFact.id], techniqueIds: [cross.id, 'fake-technique-id'] },
        { title: '근거 없음', drill: 'x', reason: 'y', factIds: [], techniqueIds: [] },
      ],
      overallFeedback: '잽 활용은 좋았고 후반 가드 유지가 가장 큰 개선 포인트입니다.',
    };
    const g = cs.groundCoachingResponse(raw, input, prepared);
    return {
      factTexts: prepared.facts.map((f) => f.text),
      limits: prepared.dataLimits,
      candLearned: prepared.candidates.find((c) => c.id === cross.id)?.learned ?? null,
      strengths: g.strengths,
      weaknesses: g.weaknesses,
      next: g.nextTraining,
      diag: g.patternDiagnoses.length,
      connection: g.categoryScores.connection,
      defense: g.categoryScores.defense,
      feedback: g.overallFeedback,
      crossId: cross.id,
      full: g,
      jabId: jab.id,
    };
  });
  check('[SP1] 사실 목록은 실제 데이터에서만 생성 (동작 수/구간 가드 점수)', sp.factTexts.some((x) => x.startsWith('내 타격성 동작 4회')) && sp.factTexts.some((x) => x === '가드 점수(0-100): 초반 74 → 후반 52'), JSON.stringify(sp.factTexts));
  check('[SP2] 측정 불가 항목 명시 (피격/가드 복귀/상대 대응)', sp.limits.some((x) => x.includes('피격')) && sp.limits.some((x) => x.includes('가드 복귀')) && sp.limits.some((x) => x.includes('상대 동작 추적 데이터가 없어')), JSON.stringify(sp.limits));
  check('[SP3] 근거(factId) 없는/가짜 근거 항목은 제거', sp.strengths.length === 1 && sp.strengths[0].label.includes('잽'), JSON.stringify(sp.strengths));
  check('[SP4] 근거 문장은 AI가 아닌 코드 사실 텍스트', sp.weaknesses[0].evidence === '가드 점수(0-100): 초반 74 → 후반 52', sp.weaknesses[0].evidence);
  check('[SP5] 다음 훈련: 근거 없는 과제 제거, 가짜 기술 id 제거, 학습한 기술 사용', sp.next.length === 1 && JSON.stringify(sp.next[0].techniqueIds) === JSON.stringify([sp.crossId]) && sp.candLearned === true, JSON.stringify(sp.next));
  check('[SP6] 존재하지 않는 패턴 진단 제거, 근거 없는 카테고리 점수는 "분석 데이터 부족"', sp.diag === 0 && sp.connection === '분석 데이터 부족' && sp.defense === 60, JSON.stringify([sp.diag, sp.connection, sp.defense]));
  check('[SP7] 종합 평가 유지', sp.feedback?.includes('가드'));

  const spId = await page.evaluate(async (coaching) => {
    const { saveSparringSession } = await import('/src/lib/sparringAnalysis/sparringSessionService.ts');
    return saveSparringSession({
      martialArt: 'boxing', videoName: 'qa.mp4', videoDurationSec: 60, videoResolution: { width: 1280, height: 720 }, analysisScopes: ['overall'],
      overallScores: { technique: null, movement: 60, distance: 50, defense: 55, offense: 65, posture: 62 }, motionEvents: [], techniqueGuesses: [], postureSegments: [], styleObservations: [],
      styleComparison: null, limitations: [], savedMoments: [], weakAreas: [{ label: '가드', score: 52 }], notes: null, excludedMotionCounts: {}, coachingSynthesis: coaching,
    }).id;
  }, sp.full);
  await goto(`#/sparring/${spId}`);
  t = await text();
  const order = ['👍 잘한 점', '⚠️ 개선할 점', '🎯 다음 훈련 추천', '📝 종합 평가'].map((h) => t.indexOf(h));
  check('[SP8] UI: 잘한 점 → 개선할 점 → 다음 훈련 → 종합 평가 순서', order.every((i) => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(order));
  check('[SP9] UI: 측정 한계 + 커리큘럼/AI 코치/자유 훈련 연결', t.includes('이 분석으로 알 수 없는 것') && t.includes('개선점으로 맞춤 커리큘럼 만들기') && t.includes('AI 코치에게 물어보기') && t.includes('자유 훈련으로 연습하기'));
  page.once('dialog', (d) => d.accept());
  await page.locator('.sparring-coaching button:has-text("오늘의 훈련에 추가")').first().click();
  await sleep(400);
  const added = await page.evaluate(async (id) => (await import('/src/lib/todayTraining/sessionStore.ts')).getTodaySession()?.plan.techniqueIds.includes(id), sp.crossId);
  check('[SP10] 추천 기술 → 오늘의 훈련에 실제 추가', added === true);
  await shot('sp-coaching');
  const legacyOk = await page.evaluate(async () => {
    const { saveSparringSession } = await import('/src/lib/sparringAnalysis/sparringSessionService.ts');
    return saveSparringSession({
      martialArt: 'boxing', videoName: 'old.mp4', videoDurationSec: 60, videoResolution: null, analysisScopes: ['overall'],
      overallScores: { technique: null, movement: null, distance: null, defense: null, offense: null, posture: null }, motionEvents: [], techniqueGuesses: [], postureSegments: [], styleObservations: [],
      styleComparison: null, limitations: [], savedMoments: [], weakAreas: [], notes: null, excludedMotionCounts: {},
      coachingSynthesis: { strengths: [{ label: '옛 강점', evidence: '옛 근거' }], weaknesses: [], patternDiagnoses: [], categoryScores: { attack: 50, defense: '분석 데이터 부족', footwork: 50, distance: 50, timing: 50, connection: 50, tacticalVariety: 50 }, improvementDirections: ['옛 개선 방향'], generatedAt: new Date().toISOString() },
    }).id;
  });
  await goto(`#/sparring/${legacyOk}`);
  t = await text();
  check('[SP11] 이전 형식(v1) 세션도 정상 표시', t.includes('옛 강점') && t.includes('옛 개선 방향'));

  // ===================== 6. 커리큘럼 삭제 =====================
  const cur = await page.evaluate(async () => {
    const svc = await import('/src/lib/curriculum/curriculumService.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const mk = (title) => svc.createCustomCurriculum({ title, description: '', martialArt: 'boxing', visibility: 'private' });
    const a = mk('QA 커리큘럼 A'), b = mk('QA 커리큘럼 B'), c = mk('QA 커리큘럼 C');
    svc.ensureProgress(svc.getCurriculum(b.id));
    const hist = recordTrainingSession({ curriculumId: b.id, dayNumber: 1, techniqueIds: [], completed: true, estimatedMinutes: 10, source: 'curriculum' });
    return { a: a.id, b: b.id, c: c.id, hist: hist.id };
  });
  await goto(`#/learning/boxing/${cur.b}`);
  page.once('dialog', (d) => d.accept());
  await page.locator('.detail-actions button:has-text("삭제")').click();
  await sleep(800);
  let state = await page.evaluate(async (ids) => {
    const svc = await import('/src/lib/curriculum/curriculumService.ts');
    const { getTrainingHistoryEntry } = await import('/src/lib/trainingHistory/service.ts');
    const raw = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
    return { hash: location.hash, ids: raw.map((c) => c.id), progress: !!svc.getProgress(ids.b), hist: !!getTrainingHistoryEntry(ids.hist) };
  }, cur);
  check('[C1] UI 삭제: 확인 후 실제 저장소에서 제거, 목록 화면으로 이동', !state.ids.includes(cur.b) && state.hash === '#/learning/boxing', JSON.stringify(state));
  check('[C2] 여러 개 중 하나만 삭제 (A, C 유지)', state.ids.includes(cur.a) && state.ids.includes(cur.c));
  check('[C3] 종속 데이터(진행도)만 삭제, 훈련 기록은 유지', !state.progress && state.hist);
  t = await text();
  check('[C4] 목록 화면에 삭제된 커리큘럼 없음', !t.includes('QA 커리큘럼 B') && t.includes('QA 커리큘럼 A'), t.slice(0, 800));

  // Failure path: cloud delete can't be confirmed (no signed-in session for this user) → rollback.
  const fail = await page.evaluate(async (ids) => {
    const { deleteCurriculumVerified } = await import('/src/lib/curriculum/deleteCurriculum.ts');
    const before = JSON.parse(localStorage.getItem('martialdex:curricula:custom')).map((c) => c.id);
    const r = await deleteCurriculumVerified(ids.c, '00000000-0000-0000-0000-000000000000');
    const after = JSON.parse(localStorage.getItem('martialdex:curricula:custom')).map((c) => c.id);
    const tomb = JSON.parse(localStorage.getItem('martialdex:curricula:deleted') || '{}');
    return { r, sameOrder: JSON.stringify(before) === JSON.stringify(after), tombstone: ids.c in tomb };
  }, cur);
  check('[C5] 서버 삭제 확인 실패 → 오류 반환 + 원래 위치로 복원 + 툴스톤 없음', fail.r.ok === false && fail.r.message.includes('삭제하지 못했습니다') && fail.sameOrder && !fail.tombstone, JSON.stringify(fail));

  // Restart → still gone.
  await app.close();
  ({ app, page } = await launch(dir));
  watch(page);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').map((c) => c.id));
  check('[C6] 앱 재실행 후에도 삭제 유지', !state.includes(cur.b) && state.includes(cur.a));

  // Delete the remaining ones; last one leaves an empty list.
  for (const id of [cur.a, cur.c]) {
    await goto(`#/learning/boxing/${id}`);
    page.once('dialog', (d) => d.accept());
    await page.locator('.detail-actions button:has-text("삭제")').click();
    await sleep(800);
  }
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]'));
  check('[C7] 마지막 커리큘럼까지 삭제 → 빈 목록', state.length === 0, JSON.stringify(state.map((c) => c.title)));
  t = await text();
  check('[C8] 삭제 후 화면 정상 (크래시 없음)', !t.includes('QA 커리큘럼'));

  check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
