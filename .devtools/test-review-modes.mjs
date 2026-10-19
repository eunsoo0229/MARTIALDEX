// 복습 5종 — data-source / weakness / no-double-count tests (offline, real modules + real library).
// Run: node .devtools/test-review-modes.mjs
import path from 'node:path';
import { createServer } from 'vite';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Minimal browser globals the stores use.
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
// search.ts spins up a Web Worker at import; these tests never search.
globalThis.Worker = class {
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
};
const events = [];
const origDispatch = globalThis.dispatchEvent?.bind(globalThis);
globalThis.dispatchEvent = (e) => {
  events.push(e.type);
  return origDispatch ? origDispatch(e) : true;
};

const server = await createServer({ root: APP, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let S, RL, LL, RS, RE, TH, TC;
try {
  S = await server.ssrLoadModule('/src/lib/review/sources.ts');
  RL = await server.ssrLoadModule('/src/lib/review/reviewLog.ts');
  LL = await server.ssrLoadModule('/src/lib/coachLesson/lessonLog.ts');
  RS = await server.ssrLoadModule('/src/lib/reviewSystem/reviewSessionStore.ts');
  RE = await server.ssrLoadModule('/src/lib/reviewSystem/reviewEngine.ts');
  TH = await server.ssrLoadModule('/src/lib/trainingHistory/service.ts');
  TC = await server.ssrLoadModule('/src/lib/techniqueCanonical/index.ts');
} finally {
  await server.close();
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''));
}

const CANON = (id) => TC.canonicalTechniqueId(id);
const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const base = (id, daysAgo, extra = {}) => ({ id, date: iso(daysAgo).slice(0, 10), completedAt: iso(daysAgo), updatedAt: iso(daysAgo), curriculumId: null, dayNumber: null, techniqueIds: ['boxing__jab'], completed: true, estimatedMinutes: 10, actualMinutes: null, notes: null, source: 'coach_today', ...extra });
const setHistory = (list) => localStorage.setItem('martialdex:training-history', JSON.stringify(list));

// ---------- 0. empty: nothing invented
localStorage.clear();
check('[0] 기록이 없으면 모든 모드가 비어 있음 (가짜 데이터 없음)', S.trainingReviewEntries().length === 0 && S.gymReviewEntries().length === 0 && S.lessonReviewItems().length === 0 && S.weakTechniques().length === 0);

// ---------- 1 / 3. training & gym sources
setHistory([
  base('h_personal', 2),
  base('h_ai', 3, { aiCoach: { location: 'home', mode: 'voice' } }),
  base('h_gym', 4, { source: 'gym_class', gymClassMeta: { gymId: 'g', gymName: 'G짐', classTitle: '기본기', sessionId: 's' } }),
  base('h_live', 5, { source: 'sparring_session', techniqueIds: [], gymClassMeta: { gymId: 'g', gymName: 'G짐', classTitle: '스파링', sessionId: 's2' }, gymLive: { sessionId: 's2', gymId: 'g', gymName: 'G짐', coachUserId: 'c', kind: 'sparring', status: 'completed', totalSets: 3, completedSets: 3, workSeconds: 120, restSeconds: 60, startedAt: null, endedAt: null } }),
  base('h_review_legacy', 1, { source: 'review' }),
  base('h_old', 100),
]);
const all = S.trainingReviewEntries();
check('[1] 전 훈련 복습: 이전 앱의 source "review" 기록은 훈련으로 보지 않음', !all.some((e) => e.source === 'review'), all.map((e) => e.id));
check('[1] 전 훈련 복습: 개인·AI코치·체육관 기록을 각각 한 번씩 포함', all.length === 5 && new Set(all.map((e) => e.id)).size === 5, all.map((e) => e.id));
check('[1] 기간 필터(30일)', S.trainingReviewEntries({ sinceDays: 30 }).length === 4);
const kinds = ['personal', 'ai_coach', 'gym'].map((k) => S.trainingReviewEntries({ sinceDays: null, kind: k }).length);
check('[1] 유형 필터의 합 = 전체 (중복 집계 없음)', kinds.reduce((a, b) => a + b, 0) === all.length, kinds);
const gym = S.gymReviewEntries();
check('[3] 전 체육관 훈련 복습: 체육관 기능이 쓴 기록만', gym.map((e) => e.id).sort().join() === 'h_gym,h_live', gym.map((e) => e.id));
check('[3] 개인 훈련은 체육관 복습에 섞이지 않음', !gym.some((e) => e.id === 'h_personal' || e.id === 'h_ai'));
check('[1] 저장되지 않은 세트/횟수는 null (추정하지 않음)', JSON.stringify(S.storedVolume(base('x', 0))) === JSON.stringify({ sets: null, reps: null, seconds: null }));
const vol = S.storedVolume(base('x', 0, { exerciseDetails: [{ techniqueId: 'boxing__jab', mode: 'reps', sets: 3, targetReps: 10, targetSeconds: null, actualReps: [10, 8, null], actualSeconds: [null, null, null], restSeconds: 30, startedAt: null, finishedAt: null }] }));
check('[1] 기록된 세트만 합산 (3세트 중 2세트 완료 = 18회)', vol.sets === 2 && vol.reps === 18 && vol.seconds === null, vol);

// ---------- 2. lessons
LL.saveLessonLog({ id: 'lesson_a', kind: 'one_off', title: '잽 수업', date: iso(3).slice(0, 10), startedAt: iso(3), finishedAt: iso(3), curriculumId: null, day: null, historyEntryId: 'h_ai', techniques: [{ techniqueId: 'boxing__jab', name: 'Jab', overall: 'partial', practiced: true, concepts: [{ id: 'c1', label: '턱 보호', explain: '뒷손으로 턱을 막는다', reference: '턱 보호', status: 'weak', evidence: '몰라요' }, { id: 'c2', label: '거리', explain: '앞발로 거리', reference: '거리', status: 'understood' }] }], qa: [{ question: '왜?', answer: '거리 때문' }], recap: null, updatedAt: iso(3) });
LL.saveLessonLog({ ...LL.getLessonLog('lesson_a'), title: '잽 수업' }); // finishing screen re-render
check('[2] 같은 수업 요약을 두 번 저장해도 1건', LL.listLessonLog().length === 1);
setHistory([...JSON.parse(localStorage.getItem('martialdex:training-history')), base('h_ai_legacy', 30, { aiCoach: { location: null, mode: 'text' }, notes: '예전 수업 · 메모' })]);
const lessons = S.lessonReviewItems();
check('[2] 요약과 연결된 AI코치 기록은 중복 표시하지 않음', lessons.filter((l) => l.historyEntry?.id === 'h_ai').length === 1, lessons.map((l) => l.id));
const legacy = lessons.find((l) => l.id === 'history_h_ai_legacy');
check('[2] 요약 저장 이전 수업은 log=null로 표시 (내용을 지어내지 않음)', !!legacy && legacy.log === null && legacy.techniqueNames.length === 0);

// ---------- 4. weak techniques
let weak = S.weakTechniques();
let jab = weak.find((w) => w.techniqueId === CANON('boxing__jab'));
check('[4] AI 코치 수업의 이해 부족 개념 → 부족 기술 (근거 포함)', jab?.signal === 'lesson' && jab.focusConcepts.includes('턱 보호') && jab.reasons.some((r) => r.includes('턱 보호')), jab);

const log1 = RL.startReviewLog('weak', null, ['bjj__armbar']);
RL.updateReviewLog(log1.id, (e) => ({ ...e, completedTechniqueIds: ['bjj__armbar'], results: [{ techniqueId: 'bjj__armbar', conceptId: 'kp-0', conceptLabel: '엉덩이', question: 'q', answer: 'a', verdict: 'weak', missing: [], method: 'keyword' }], finishedAt: iso(0) }));
await new Promise((r) => setTimeout(r, 5));
const log2 = RL.startReviewLog('weak', null, ['bjj__armbar']);
RL.updateReviewLog(log2.id, (e) => ({ ...e, completedTechniqueIds: ['bjj__armbar'], results: [{ techniqueId: 'bjj__armbar', conceptId: 'kp-0', conceptLabel: '엉덩이', question: 'q', answer: 'a', verdict: 'weak', missing: [], method: 'ai' }], finishedAt: iso(0) }));
weak = S.weakTechniques();
const armbar = weak.find((w) => w.techniqueId === 'bjj__armbar');
check('[4] 복습 확인에서 2회 이상 이해 부족 → 최우선(review_repeated)', armbar?.signal === 'review_repeated' && weak[0].techniqueId === 'bjj__armbar', weak.map((w) => [w.techniqueId, w.signal]));

await new Promise((r) => setTimeout(r, 5));
const log3 = RL.startReviewLog('weak', null, ['bjj__armbar']);
RL.updateReviewLog(log3.id, (e) => ({ ...e, completedTechniqueIds: ['bjj__armbar'], results: [{ techniqueId: 'bjj__armbar', conceptId: 'kp-0', conceptLabel: '엉덩이', question: 'q', answer: 'a', verdict: 'understood', missing: [], method: 'ai' }], finishedAt: iso(0) }));
weak = S.weakTechniques();
check('[4] 이후 확인에서 이해함 → 부족 기술에서 빠지고 "보완됨"으로 이동', !weak.some((w) => w.techniqueId === 'bjj__armbar') && S.recentlyImproved().some((x) => x.techniqueId === 'bjj__armbar'));

await new Promise((r) => setTimeout(r, 5));
const log4 = RL.startReviewLog('training', 'h_personal', ['bjj__armbar']);
RL.updateReviewLog(log4.id, (e) => ({ ...e, completedTechniqueIds: ['bjj__armbar'], difficultTechniqueIds: ['bjj__armbar'], finishedAt: iso(0) }));
const back = S.weakTechniques().find((w) => w.techniqueId === 'bjj__armbar');
check('[4] 보완된 뒤 복습 중 "아직 어려워요" → 다시 부족 기술 (근거 문장 포함)', !!back && back.reasons.some((r) => r.includes('아직 어려워요')), back);

localStorage.setItem('martialdex:skill-status-overrides', JSON.stringify({ 'wrestling__wrestling-stance': 'needs_improvement' }));
check('[4] 사용자가 "개선 필요"로 지정 → user_marked', S.weakTechniques().find((w) => w.techniqueId === 'wrestling__wrestling-stance')?.signal === 'user_marked');

// pose low + stale vs pose low but just reviewed
localStorage.setItem('martialdex:pose-records', JSON.stringify([
  { recordId: 'p1', techniqueId: 'boxing__cross', martialArtId: 'boxing', score: 40, status: 'needs_improvement', metricScores: {}, analyzedAt: iso(40) },
  { recordId: 'p2', techniqueId: 'boxing__hook', martialArtId: 'boxing', score: 40, status: 'needs_improvement', metricScores: {}, analyzedAt: iso(40) },
]));
const log5 = RL.startReviewLog('ai', null, ['boxing__hook']);
RL.updateReviewLog(log5.id, (e) => ({ ...e, completedTechniqueIds: ['boxing__hook'], finishedAt: iso(0) }));
weak = S.weakTechniques();
const crossId = CANON('boxing__cross');
const hookId = CANON('boxing__hook');
check('[4] 자세 점수 낮음 + 오래 복습 안 함 → pose_stale', weak.find((w) => w.techniqueId === crossId)?.signal === 'pose_stale', weak.map((w) => [w.techniqueId, w.signal]));
check('[4] 자세 점수가 낮아도 최근 복습했으면 제외', !weak.some((w) => w.techniqueId === hookId), { hookId, weak: weak.map((w) => w.techniqueId) });
check('[4] 모든 부족 기술에 근거 문장이 있음', weak.every((w) => w.reasons.length > 0));

// ---------- 5. AI 추천 복습 session → review log only
const beforeHistory = TH.listTrainingHistory().length;
const sess = RS.startReviewSession(['boxing__jab', 'bjj__armbar']);
RS.markReviewTechniqueComplete('boxing__jab');
RS.markReviewTechniqueComplete('bjj__armbar');
RS.finalizeReviewSession(RS.getTodayReviewSession());
const aiLog = RL.getReviewLog(sess.reviewLogId);
check('[5] AI 추천 복습 완료 → 훈련 기록 수 변화 없음', TH.listTrainingHistory().length === beforeHistory, { before: beforeHistory, after: TH.listTrainingHistory().length });
check('[5] AI 추천 복습 완료 → 복습 기록(mode ai)에 저장', aiLog?.mode === 'ai' && !!aiLog.finishedAt && aiLog.completedTechniqueIds.length === 2, aiLog);

// review resets the schedule (read from review log, not training)
setHistory([base('h_sched', 10, { source: 'curriculum', techniqueIds: ['muay-thai__push-teep'] })]);
localStorage.removeItem('martialdex:pose-records');
const candBefore = RE.computeReviewCandidates().find((c) => c.techniqueId === 'muay-thai__push-teep');
const log6 = RL.startReviewLog('training', 'h_sched', ['muay-thai__push-teep']);
RL.updateReviewLog(log6.id, (e) => ({ ...e, completedTechniqueIds: ['muay-thai__push-teep'], finishedAt: new Date().toISOString() }));
const candAfter = RE.computeReviewCandidates().find((c) => c.techniqueId === 'muay-thai__push-teep');
check('[5] 복습 후 다음 복습 예정일이 뒤로 밀림 (훈련 횟수는 그대로)', !!candBefore && !!candAfter && candAfter.nextReviewAt > candBefore.nextReviewAt && candAfter.urgencyScore < candBefore.urgencyScore, { before: candBefore?.nextReviewAt, after: candAfter?.nextReviewAt });
check('[5] 복습으로 연습 날짜(lastPracticedAt)는 바뀌지 않음', candAfter?.lastPracticedAt === candBefore?.lastPracticedAt);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
