// 기술 근거 검색 · 답변 가능 판정 · 결정론적 채점 · 코치 선택 저장 — offline tests
// (no AI, no browser). Bundles the PURE modules with esbuild and runs them on
// real MARTIALDEX data (data/processed + data/curated/posture.json).
// Run: node .devtools/test-coach-knowledge.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-knowledge-'));
const out = path.join(dir, 'k.mjs');
const entry = path.join(dir, 'entry.ts');
const mod = (p) => JSON.stringify(path.join(APP, p));
fs.writeFileSync(
  entry,
  [
    `export * from ${mod('src/lib/coachKnowledge/evidence.ts')};`,
    `export * from ${mod('src/lib/coachKnowledge/answerability.ts')};`,
    `export * from ${mod('src/lib/coachKnowledge/modelGuard.ts')};`,
    `export * from ${mod('src/lib/coachLesson/evidenceGrader.ts')};`,
    `export { lessonStep, createLessonState } from ${mod('src/lib/coachLesson/engine.ts')};`,
    `export { buildConcepts, keyPointsReference, lessonName } from ${mod('src/lib/coachLesson/concepts.ts')};`,
    `export { buildScenarios } from ${mod('src/lib/coachLesson/scenario.ts')};`,
    `export { classifyIntent } from ${mod('src/lib/coachLesson/intent.ts')};`,
    `export * from ${mod('src/lib/coachProvider/types.ts')};`,
    `export * as store from ${mod('src/lib/aiCoachDay/sessionStore.ts')};`,
    `export * as oneOffStore from ${mod('src/lib/coachLesson/oneOffSession.ts')};`,
    `export * as pref from ${mod('src/lib/coachProvider/preference.ts')};`,
    `export * as lessonLog from ${mod('src/lib/coachLesson/lessonLog.ts')};`,
  ].join('\n')
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });

// window + localStorage for the storage modules
const mem = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
  dispatchEvent: () => true,
};
globalThis.CustomEvent ??= class { constructor(t) { this.type = t; } };
const K = await import(pathToFileURL(out).href);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''));
}

// ---- real data
const posture = JSON.parse(fs.readFileSync(path.join(APP, 'data/curated/posture.json'), 'utf8'));
function technique(art, id) {
  const arr = JSON.parse(fs.readFileSync(path.join(APP, `data/processed/${art}.json`), 'utf8'));
  const list = Array.isArray(arr) ? arr : arr.techniques ?? Object.values(arr);
  const t = list.find((x) => x && x.id === id);
  if (!t) throw new Error(`missing ${id}`);
  return { ...t, videos: [], posture: posture[id] };
}
const jab = technique('boxing', 'boxing__jab');
const rnc = technique('bjj', 'bjj__rear-naked-choke');
const armbar = technique('bjj', 'bjj__armbar');
const doubleLeg = technique('wrestling', 'wrestling__basic-double-leg');

// =============================================================== 1. evidence retrieval
{
  const ev = K.buildEvidence(jab);
  const a = K.judgeAnswerability(ev, K.needsOf('잽 칠 때 발은 어떻게 둬요?'));
  const feet = jab.posture.bodyPosition.feet;
  const text = K.evidenceAnswerText(ev, a);
  check('[1] 자료에 있는 질문(잽의 발 위치)은 해당 필드 근거와 함께 답변 가능', a.status === 'answerable' && a.needs[0].evidence[0].source === 'posture.bodyPosition.feet' && text.includes(feet), { status: a.status, source: a.needs[0].evidence[0]?.source, text });
  const kp = K.judgeAnswerability(ev, K.needsOf('잽의 핵심 포인트가 뭐예요?'));
  check('[1b] 핵심 포인트 질문 → posture.keyPoints 근거(원문 그대로)', kp.status === 'answerable' && kp.needs[0].evidence[0].values.join('|') === jab.posture.keyPoints.join('|'), kp.needs[0].evidence[0]?.values);
  check('[1c] 필드별로 존재/부재가 구분됨 (잽: 발 있음, 골반 없음)', ev.present.includes('body.feet') && ev.absent.includes('body.hips'), { present: ev.present, absent: ev.absent });
}

// =============================================================== 2. missing details
{
  const ev = K.buildEvidence(rnc);
  const a = K.judgeAnswerability(ev, K.needsOf('리어 네이키드 초크 할 때 발은 어떻게 해요?'));
  const text = K.evidenceAnswerText(ev, a);
  check('[2] 자료에 없는 세부(RNC의 발 위치)는 missing, 답변 불가', a.status === 'unanswerable' && a.missing.includes('발 위치') && /내용이 없습니다/.test(text) && /추측/.test(text), { a: a.status, missing: a.missing, text });
  const mixed = K.judgeAnswerability(ev, K.needsOf('팔은 어디에 두고 발은 어떻게 해요?'));
  check('[2b] 일부만 있으면 확인된 것(팔)과 확인되지 않은 것(발)을 분리', mixed.status === 'partial' && mixed.confirmed.includes('팔·손') && mixed.missing.includes('발 위치') && /확인되지 않았습니다/.test(K.evidenceAnswerText(ev, mixed)), mixed);
  // overview mentions feet, but an overview is not evidence about the feet
  const overviewOnly = { ...rnc, id: 'test__overview-only', description: '', purpose: null, principles: [], positions: [], posture: { overview: '발을 어깨너비로 벌리고 서서 하는 기술입니다.' } };
  const o = K.judgeAnswerability(K.buildEvidence(overviewOnly), K.needsOf('발은 어떻게 둬요?'));
  check('[2c] 개요만 있는 기술은 개요에 "발"이라는 단어가 있어도 발 위치 질문에 답변 불가', o.status === 'unanswerable', o);
  // empty / placeholder / generic values are not evidence
  const junk = { ...rnc, id: 'test__junk', description: '   ', purpose: '-', principles: ['준비 중'], positions: [], posture: { overview: 'N/A', keyPoints: ['', '없음'], steps: [] } };
  const je = K.buildEvidence(junk);
  check('[2d] 빈 문자열·"-"·"준비 중"·"N/A"·"없음"은 근거로 치지 않음', !je.present.some((f) => ['description', 'purpose', 'principles', 'overview', 'keyPoints'].includes(f)), je.present);
  const shared = '모든 펀치에 공통으로 붙어 있는 분류 설명 문단입니다. 펀치는 상대를 타격하는 기술입니다.';
  const ge = K.buildEvidence({ ...jab, purpose: shared }, { genericTexts: new Set([K.genericKey(shared)]) });
  check('[2e] 여러 기술에 똑같이 붙은 일반 문단은 이 기술의 근거로 쓰지 않음', !ge.present.includes('purpose') && ge.rejected.some((r) => r.field === 'purpose'), ge.rejected);
  // a step that explicitly names the feet is quoted (the technique's own text), with its source shown
  const stepFeet = { ...rnc, id: 'test__step-feet', posture: { overview: '테스트', steps: ['1단계 — 시작 자세: 앞발을 반 걸음 내딛습니다.'] } };
  const sf = K.judgeAnswerability(K.buildEvidence(stepFeet), K.needsOf('발은?'));
  check('[2f] 발 전용 필드가 없어도 그 기술의 단계 문장이 발을 직접 언급하면 출처 표시와 함께 인용', sf.status === 'answerable' && sf.needs[0].viaMention && /동작 설명 중 언급/.test(K.evidenceAnswerText(K.buildEvidence(stepFeet), sf)), sf.needs[0]);
}

// =============================================================== 3. no invented techniques
{
  const ev = K.buildEvidence(jab, { related: [{ techniqueId: 'kickboxing__cross', name: 'Cross', relation: 'next' }] });
  const a = K.judgeAnswerability(ev, K.needsOf('잽 다음에 뭐랑 연결해요?'));
  check('[3] 관련 기술은 실제로 연결된 기술만(호출자가 확인한 목록), 그 외는 만들지 않음', a.status === 'answerable' && JSON.stringify(ev.fields.related.values) === '["Cross"]', ev.fields.related);
  const none = K.judgeAnswerability(K.buildEvidence(rnc), K.needsOf('이거랑 연결되는 기술은?'));
  check('[3b] 연결 정보가 없으면 관련 기술 질문은 답변 불가 (다른 기술을 지어내지 않음)', none.status === 'unanswerable', none);
  const known = new Set(['jab', 'cross', 'lead hook', 'kimura', '크로스']);
  const ka = K.judgeAnswerability(K.buildEvidence(jab), K.needsOf('잽의 핵심 포인트는?'));
  const kev = K.buildEvidence(jab);
  const bad1 = K.guardModelText('잽은 반대 손 가드를 유지하고, 이어서 Kimura로 연결합니다.', kev, ka, known);
  const bad2 = K.guardModelText('잽을 치는 자세는 다리를 가슴에 올려서 다리를 가슴에 올려서 다리를 가슴에 올려서 다리를 가슴에 올려서 다리를', kev, ka, known);
  const bad3 = K.guardModelText('잽은 무에타이의 특수 kỹ thuật 중 하나입니다.', kev, ka, known);
  const bad4 = K.guardModelText('잽은 3초 안에 5번 회수해야 합니다.', kev, ka, known);
  const good = K.guardModelText('잽을 칠 때는 반대 손 가드를 끝까지 유지하고, 타격 후 손을 즉시 회수하세요.', kev, ka, known);
  check('[3c] 로컬 모델 출력 검사: 근거에 없는 기술 이름·반복 붕괴·외국 문자·근거 없는 숫자는 거부, 근거 내용만 말하면 통과', !bad1.ok && !bad2.ok && !bad3.ok && !bad4.ok && good.ok, { bad1: bad1.reasons, bad2: bad2.reasons, bad3: bad3.reasons, bad4: bad4.reasons, good: good.reasons });
}

// =============================================================== 3d. local model output checks (measured failure modes of llama3.2:1b)
{
  const kev = K.buildEvidence(jab);
  const ka = K.judgeAnswerability(kev, K.needsOf('잽에서 흔한 실수는 뭐예요?'));
  const mixed = K.guardModelText('반대 손 가드가 내려가면 턱이 expose되기 때문에 흔한 실수로 becomes 됩니다.', kev, ka, new Set(), '잽에서 흔한 실수는 뭐예요?');
  check('[3d] 한국어 답에 근거에 없는 영어 단어가 섞이면 거부 (실측: "턱이 expose되기")', !mixed.ok && mixed.reasons.some((r) => r.includes('영어 단어')), mixed.reasons);
  const offTopic = K.guardModelText('잽은 복싱 역사에서 오래된 기술로 유명한 챔피언들이 경기에서 자주 사용했고 관중에게 인기가 많았습니다.', kev, ka, new Set(), '잽에서 흔한 실수는 뭐예요?');
  check('[3e] 근거와 무관한 내용(역사·인기 이야기)은 거부', !offTopic.ok && offTopic.reasons.some((r) => r.includes('무관')), offTopic.reasons);
  const sameSentence = K.guardModelText('반대 손 가드를 유지하세요. 타격 후 손을 즉시 회수하세요. 반대 손 가드를 유지하세요.', kev, ka, new Set(), '');
  check('[3f] 같은 문장을 다시 말하면 거부', !sameSentence.ok && sameSentence.reasons.includes('같은 문장 반복'), sameSentence.reasons);
  const good = K.guardModelText('반대 손 가드가 내려가 턱이 노출되는 것과, 타격 후 손을 늦게 회수해 반격에 노출되는 것이 흔한 실수입니다.', kev, ka, new Set(), '잽에서 흔한 실수는 뭐예요?');
  check('[3g] 근거 문장을 다듬기만 한 답은 통과', good.ok, good.reasons);
  const why = K.needsOf('암바에서 고관절은 왜 들어요?').map((n) => n.id);
  const whyArm = K.judgeAnswerability(K.buildEvidence(armbar), K.needsOf('암바에서 고관절은 왜 들어요?'));
  check('[3h] "고관절은 왜 들어요?"는 고관절 근거로 답함 (사용 상황 목록으로 답하지 않음 — 실측 오답 수정)', JSON.stringify(why) === '["body.hips"]' && whyArm.status === 'answerable' && /고관절/.test(K.evidenceAnswerText(K.buildEvidence(armbar), whyArm)), { why, text: K.evidenceAnswerText(K.buildEvidence(armbar), whyArm) });
  check('[3i] 신체 부위가 있어도 "언제/상황" 질문은 사용 상황으로', K.needsOf('발로 차는 건 언제 써요?').some((n) => n.id === 'purpose'));
}

// =============================================================== 4/5. grading
function ctxFor(t) {
  return { name: K.lessonName(t), concepts: K.buildConcepts(t, { distractors: ['상대의 다리를 잡아 넘어뜨리는 테이크다운입니다.', '상대의 목을 조르는 기술입니다.'] }), scenarios: K.buildScenarios(t), keyPointsReference: K.keyPointsReference(t), prior: null };
}
{
  const ctx = ctxFor(armbar);
  const kp0 = ctx.concepts.find((c) => c.id === 'kp-0');
  const g = (answer) => K.gradeByEvidence({ concept: kp0, reference: kp0.reference, mistakes: armbar.posture.commonMistakes, answer });
  const right = g('다리를 상대 머리 위로 완전히 넘겨서 공간을 막아야 해요');
  const unrelated = g('주먹으로 상대 턱을 세게 칩니다');
  const mistake = g('팔로만 당겨서 압박하면 돼요');
  // 1차 구현의 한계였던 경우: 다른 대상을 부정하는 말("신경 쓰지 말고")이 섞여도, 부정 범위를 절 단위로 보아
  // 뒤에서 주장한 실수("팔로만 당겨서 압박")는 실수로 판정한다.
  const negElsewhere = g('고관절은 신경 쓰지 말고 팔로만 당겨서 압박해요');
  const oneWord = g('다리');
  check('[4] 명백한 오답(무관한 답)은 정답 아님', unrelated.verdict !== 'understood' && unrelated.coverage === 'no_match', unrelated);
  check('[4b] 기술 자료의 흔한 실수를 답으로 말하면(부정 없이) 오답 처리', mistake.verdict === 'weak' && mistake.coverage === 'contradicted', { verdict: mistake.verdict, c: mistake.contradiction });
  check('[4b-limit] 다른 대상을 부정하는 말이 섞여도 정답 처리되지 않고, 뒤에서 주장한 실수는 실수로 판정', negElsewhere.verdict !== 'understood' && negElsewhere.coverage === 'contradicted', { verdict: negElsewhere.verdict, coverage: negElsewhere.coverage });
  check('[4c] 맞는 답은 필수 정답 요소 확인으로 이해 판정', right.verdict === 'understood' && right.coverage === 'full_match', right.elements.map((e) => [e.text, e.hits, e.need]));
  check('[4d] 단어 하나("다리")만 겹치면 정답 처리하지 않음', oneWord.verdict !== 'understood', { v: oneWord.verdict, el: oneWord.elements.map((e) => [e.hits, e.need]) });
  const avoid = g('다리를 머리 위로 완전히 넘기지 못해 탈출 공간을 허용하지 않게 해요');
  check('[4e] 실수를 "피한다"고 말하는 답(부정)은 실수 진술로 보지 않음', avoid.coverage !== 'contradicted', avoid.coverage);
  // 5. not enough answer elements → never full marks
  const thin = { id: 'kp-x', label: '짧음', importance: 'core', explain: '', variants: [], reference: '빠름', keywords: ['빠름'], questions: {}, choice: null };
  const t1 = K.gradeByEvidence({ concept: thin, reference: thin.reference, mistakes: [], answer: '빠름이 중요해요 빠름 빠름' });
  check('[5] 정답 요소를 구성할 자료가 부족하면 평가 불가로 만점(understood) 금지', t1.coverage === 'not_evaluable' && t1.verdict !== 'understood', t1);
  const rec = K.recapHitsByEvidence([{ label: '무릎을 좁게 조여 팔이 빠지지 않게 하기', reference: '' }, { label: '고관절을 들어 올려 압박 만들기', reference: '' }], '무릎이요');
  check('[5b] 복습 답에서 단어 하나로 핵심 포인트를 맞힌 것으로 치지 않음', rec.length === 0, rec);
}

// =============================================================== 6. a wrong model output cannot move the lesson
{
  const ctx = ctxFor(armbar);
  let r = K.lessonStep(K.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  // reach the first open question on kp-0
  let guard = 0;
  while (guard++ < 12 && !(r.state.pending && r.state.pending.conceptId === 'kp-0' && r.state.pending.type !== 'confirm' && r.state.pending.type !== 'choice')) {
    const p = r.state.pending;
    const text = p?.type === 'confirm' ? '네 이해했어요' : p?.choice ? String.fromCharCode(65 + p.choice.answerIndex) : '이해했어요';
    r = K.lessonStep(r.state, ctx, { type: 'STUDENT', text, intent: K.classifyIntent(text, p), analysis: p?.conceptId === 'purpose' && p.type !== 'confirm' ? { kind: 'answer', verdict: 'understood', understood: [], missing: [], misconception: null, feedback: '좋습니다.', reexplain: null, reply: null, method: 'ai' } : null });
  }
  const pending = r.state.pending;
  const reached = pending?.conceptId === 'kp-0';
  const kp0 = ctx.concepts.find((c) => c.id === 'kp-0');
  const wrong = '주먹으로 상대 턱을 세게 칩니다';
  const grade = K.gradeByEvidence({ concept: kp0, reference: kp0.reference, mistakes: armbar.posture.commonMistakes, answer: wrong });
  const lyingModel = { kind: 'answer', verdict: 'understood', understood: ['전부'], missing: [], misconception: null, feedback: '완벽합니다!', reexplain: null, reply: null, method: 'ai' };
  const final = K.reconcileAnalysis(grade, lyingModel, wrong);
  const after = K.lessonStep(r.state, ctx, { type: 'STUDENT', text: wrong, intent: 'answer', analysis: final });
  check('[6] 모델이 오답을 "이해"라고 해도 결정론적 채점이 막아 다음 개념으로 넘어가지 않음', reached && final.verdict !== 'understood' && final.grading.modelOverruled && !after.state.completedConcepts.includes('kp-0') && after.state.conceptIndex === r.state.conceptIndex, { reached, final: final.verdict, stage: after.state.currentStage, completed: after.state.completedConcepts });
  const questionLie = K.reconcileAnalysis(grade, { ...lyingModel, kind: 'question', reply: '아무 답' }, wrong);
  check('[6b] 질문이 아닌 답을 모델이 "질문"으로 분류해도 답으로 채점 (단계 우회 불가)', questionLie.kind === 'answer' && questionLie.verdict !== 'understood', questionLie);
  const garbage = K.reconcileAnalysis(grade, { ...lyingModel, method: 'keyword' }, wrong);
  check('[6c] 모델 결과가 없거나 오프라인 대체면 결정론적 채점 그대로', garbage.method === 'evidence' && garbage.verdict === grade.verdict, garbage.method);
  const right = '다리를 상대 머리 위로 완전히 넘겨서 공간을 막아야 해요';
  const rg = K.gradeByEvidence({ concept: kp0, reference: kp0.reference, mistakes: armbar.posture.commonMistakes, answer: right });
  const strictModel = K.reconcileAnalysis(rg, { ...lyingModel, verdict: 'partial', feedback: '조금 더 구체적으로.' }, right);
  check('[6d] 모델은 판정을 낮출 수는 있음 (더 엄격한 쪽은 안전)', strictModel.verdict === 'partial' && !strictModel.grading.modelOverruled, strictModel.grading);
}

// =============================================================== 8. records / sessions compatibility
{
  const legacyRun = { id: 'r1', curriculumId: 'c1', day: 1, mode: 'text', techniqueIds: ['bjj__armbar'], index: 0, step: 'lesson', messages: [], practice: null, outcomes: { bjj__armbar: { practicedSeconds: 0, completed: false, quiz: null } }, pendingQuiz: null, startedAt: '2026-10-01T00:00:00Z', finishedAt: null, historyEntryId: null };
  mem.set('martialdex:ai-coach-day-run', JSON.stringify(legacyRun));
  const loaded = K.store.getCoachDayRun();
  check('[8] 코치 정보가 없는 이전 수업 세션은 그대로 불러와지고 코치는 "unknown" (Gemini로 추정하지 않음)', loaded?.id === 'r1' && K.coachKindOf(loaded) === 'unknown' && K.COACH_LABEL[K.coachKindOf(loaded)].includes('정보 없음'), K.coachKindOf(loaded));
  const fresh = K.store.startCoachDayRun('c2', 3, 'voice', ['boxing__jab'], 'home', [], 'martialdex');
  const legacyStart = K.store.startCoachDayRun('c3', 1, 'text', ['boxing__jab']);
  check('[8b] 새 세션에는 선택한 코치가 저장되고, 코치 없이 만든 세션에는 필드가 없음(기존 형식 그대로)', fresh.coachKind === 'martialdex' && !('coachKind' in legacyStart) && K.coachKindOf({ coachKind: 'bogus' }) === 'unknown', { fresh: fresh.coachKind, legacy: Object.keys(legacyStart).includes('coachKind') });
  // one-off and curriculum sessions are separate stores — one coach never leaks into the other
  K.store.startCoachDayRun('c4', 1, 'text', ['boxing__jab'], null, [], 'martialdex');
  const ctx = ctxFor(jab);
  const st = K.createLessonState(jab.id, ctx);
  K.oneOffStore.saveOneOffSession({ v: 1, lesson: { id: 'l1', context: ctx, request: '잽', mode: 'technique', title: '잽', martialArt: 'boxing', techniqueId: jab.id }, state: st, directive: 'teach', messages: [], startedAt: 0, recorded: false, plan: null, run: null, workoutResult: null, videos: null, coachKind: 'gemini' });
  check('[8c] 커리큘럼 수업(자체 코치)과 1회성 수업(Gemini)의 코치 선택이 섞이지 않음', K.coachKindOf(K.store.getCoachDayRun()) === 'martialdex' && K.coachKindOf(K.oneOffStore.loadOneOffSession()) === 'gemini');
  const legacyOneOff = { ...K.oneOffStore.loadOneOffSession() };
  delete legacyOneOff.coachKind;
  K.oneOffStore.saveOneOffSession(legacyOneOff);
  check('[8d] 코치 정보 없는 이전 1회성 수업도 불러와지고 "unknown"', K.coachKindOf(K.oneOffStore.loadOneOffSession()) === 'unknown');
  K.lessonLog.saveLessonLog({ id: 'old', kind: 'one_off', title: 't', date: '2026-10-01', startedAt: 'a', finishedAt: '2026-10-01T00:00:00Z', curriculumId: null, day: null, historyEntryId: null, techniques: [], qa: [], recap: null, updatedAt: 'x' });
  K.lessonLog.saveLessonLog({ id: 'new', kind: 'one_off', title: 't', date: '2026-10-02', startedAt: 'a', finishedAt: '2026-10-02T00:00:00Z', curriculumId: null, day: null, historyEntryId: null, techniques: [], qa: [], recap: null, updatedAt: 'x', coachKind: 'martialdex' });
  const logs = K.lessonLog.listLessonLog();
  check('[8e] 수업 기록: 이전 기록(코치 없음)은 unknown, 새 기록은 선택한 코치', K.coachKindOf(logs.find((l) => l.id === 'old')) === 'unknown' && K.coachKindOf(logs.find((l) => l.id === 'new')) === 'martialdex');
  K.pref.saveCoachPreference({ last: 'martialdex', remember: false });
  const p1 = K.pref.rememberedCoach();
  K.pref.saveCoachPreference({ last: 'gemini', remember: true });
  check('[8f] 기본값은 "매번 묻기"(마지막 선택만 기억), "다음부터 묻지 않기"일 때만 자동 선택', p1 === null && K.pref.getCoachPreference().last === 'gemini' && K.pref.rememberedCoach() === 'gemini');
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
