// Coach Lesson Engine — offline behaviour tests (no AI, no browser).
// Bundles the PURE lesson modules with esbuild and drives them with a
// scripted student on real MARTIALDEX data (bjj__armbar, boxing__jab).
// Grading is simulated with AnswerAnalysis objects, exactly what the
// analyzer would feed the engine. Run: node .devtools/test-coach-lesson-engine.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coach-lesson-')), 'lesson.mjs');
const entry = path.join(path.dirname(out), 'entry.ts');
fs.writeFileSync(
  entry,
  ['engine', 'concepts', 'scenario', 'intent'].map((m) => `export * from ${JSON.stringify(path.join(APP, 'src/lib/coachLesson', m + '.ts'))};`).join('\n') +
    `\nexport { informalEndings } from ${JSON.stringify(path.join(APP, 'src/lib/aiCoachDay/politeSpeech.ts'))};\n`
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const L = await import(pathToFileURL(out).href);

// ---- real data
const posture = JSON.parse(fs.readFileSync(path.join(APP, 'data/curated/posture.json'), 'utf8'));
function technique(art, id) {
  const arr = JSON.parse(fs.readFileSync(path.join(APP, `data/processed/${art}.json`), 'utf8'));
  const list = Array.isArray(arr) ? arr : arr.techniques ?? Object.values(arr);
  const t = list.find((x) => x.id === id);
  return { ...t, videos: [], posture: posture[id] };
}
const armbar = technique('bjj', 'bjj__armbar');
const jab = technique('boxing', 'boxing__jab');

function ctxFor(t, prior = null) {
  return { name: L.lessonName(t), concepts: L.buildConcepts(t, { distractors: ['상대의 다리를 잡아 넘어뜨리는 테이크다운입니다.', '상대의 목을 조르는 기술입니다.'] }), scenarios: L.buildScenarios(t), keyPointsReference: L.keyPointsReference(t), prior };
}
const A = (verdict, extra = {}) => ({ kind: 'answer', verdict, understood: [], missing: [], misconception: null, feedback: '', reexplain: null, reply: null, method: 'ai', ...extra });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''));
}

/** Drives a lesson. `student(pending, state)` returns {text, analysis?, answer?} or a VIDEO_DONE/PRACTICE_DONE event. */
function run(t, student, { maxTurns = 60, prior = null } = {}) {
  const ctx = ctxFor(t, prior);
  let r = L.lessonStep(L.createLessonState(t.id, ctx), ctx, { type: 'START' });
  const log = [{ who: 'coach', actions: r.actions, directive: r.directive, stage: r.state.currentStage }];
  let turns = 0;
  while (r.directive !== 'next' && turns++ < maxTurns) {
    let ev;
    if (r.directive === 'video') ev = { type: 'VIDEO_DONE' };
    else if (r.directive === 'ready') ev = { type: 'PRACTICE_DONE', completed: true };
    else {
      if (!r.state.pending) throw new Error(`waiting without a question at ${r.state.currentStage}`);
      const s = student(r.state.pending, r.state, ctx);
      const intent = s.intent ?? L.classifyIntent(s.text, r.state.pending);
      ev = { type: 'STUDENT', text: s.text, intent, analysis: s.analysis ?? null, answer: s.answer ?? null };
      log.push({ who: 'student', text: s.text, intent, pending: r.state.pending });
    }
    r = L.lessonStep(r.state, ctx, ev);
    log.push({ who: 'coach', event: ev.type, actions: r.actions, directive: r.directive, stage: r.state.currentStage });
  }
  return { r, log, ctx, turns };
}
const coachTexts = (log) => log.filter((l) => l.who === 'coach').flatMap((l) => l.actions.map((a) => a.content ?? a.question ?? a.instruction ?? (a.situation ? `${a.situation} ${a.question}` : '')).filter(Boolean));
const asks = (log) => log.filter((l) => l.who === 'coach').flatMap((l) => l.actions.filter((a) => ['ASK', 'CHECK_UNDERSTANDING', 'SCENARIO'].includes(a.type)));

// ---- data-grounded concepts
{
  const ctx = ctxFor(armbar);
  check('[D1] 개념은 실제 MARTIALDEX 데이터에서만 생성 (암바: 원리 + 핵심 2개)', ctx.concepts.length === 3 && ctx.concepts[1].label.includes('다리를 상대 머리') && ctx.concepts[0].explain.includes('암바'), ctx.concepts.map((c) => c.label));
  check('[D2] 핵심 포인트 ↔ 흔한 실수 매칭으로 "왜" 질문 생성', !!ctx.concepts[2].questions.why && ctx.concepts[2].reference.includes('무릎을 조이지 않아'), ctx.concepts[2].reference);
  check('[D3] 선택형 문제: 오답 보기 = 문서화된 흔한 실수, 정답 1개', ctx.concepts[1].choice && ctx.concepts[1].choice.options.length === 3 && ctx.concepts[1].choice.options[ctx.concepts[1].choice.answerIndex] === armbar.posture.keyPoints[0]);
  check('[D4] 상황 판단 문제는 별도 모듈(buildScenarios)로 분리, 실수→핵심 매칭에서 생성', ctx.scenarios.length >= 1 && ctx.scenarios[0].situation.includes('상황이 생겼습니다'), ctx.scenarios[0]);
  const start = L.lessonStep(L.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  const longest = Math.max(...start.actions.map((a) => (a.content ?? a.question ?? '').length));
  check('[D5] 첫 턴: 짧은 설명 → 바로 질문 (장시간 혼자 말하지 않음)', start.actions.at(-1).type === 'ASK' && start.state.pending && longest < 160 && start.actions.length <= 3, { n: start.actions.length, longest, acts: start.actions.map((a) => a.type) });
}

// ---- Case 1: every answer correct → fast
const c1 = run(armbar, (p) => ({ text: p.choice ? String.fromCharCode(65 + p.choice.answerIndex) : '정확한 답', analysis: A('understood', { feedback: '맞습니다. 핵심을 정확히 짚으셨습니다.' }) }));
{
  const studentTurns = c1.log.filter((l) => l.who === 'student').length;
  const reexplains = c1.log.flatMap((l) => l.actions ?? []).filter((a) => a.type === 'REEXPLAIN').length;
  check('[Case1] 모두 정답 → 재설명 없이 빠르게 진행, 수업 완료', c1.r.directive === 'next' && reexplains === 0 && studentTurns <= 7, { studentTurns, reexplains });
  check('[Case1b] 연속 정답 → 레벨 상승(설명 생략·진단 질문) 적용', c1.r.state.level === 'advanced' && c1.log.some((l) => l.actions?.some((a) => a.type === 'ASK' && a.purpose === 'diagnose')), c1.r.state.level);
  check('[Case1c] 완료 시 모든 개념 이해로 기록', c1.r.state.understanding.overall === 'understood');
  check('[Case1d] 수행 후 질문(실습 후 확인) 실행', c1.log.some((l) => l.actions?.some((a) => a.purpose === 'practice_review')));
  check('[Case1e] 이해도 높음 → 상황 판단 문제 출제', c1.log.some((l) => l.actions?.some((a) => a.type === 'SCENARIO')));
}

// ---- Case 2 + 7: always wrong → different explanations, no infinite loop
const c2 = run(armbar, (p) => ({ text: p.choice ? String.fromCharCode(65 + ((p.choice.answerIndex + 1) % p.choice.options.length)) : '그냥 팔을 세게 당기는 거', analysis: A('weak', { feedback: '그 부분은 조금 다르게 생각해 보겠습니다.' }) }));
{
  const reex = c2.log.flatMap((l) => l.actions ?? []).filter((a) => a.type === 'REEXPLAIN').map((a) => a.content);
  const dup = reex.filter((x, i) => reex.indexOf(x) !== i);
  check('[Case2] 계속 틀림 → 매번 다른 방식으로 재설명 (같은 설명 반복 없음)', reex.length >= 3 && dup.length === 0, { reex: reex.length, dup });
  const perConcept = Object.values(c2.r.state.understanding.concepts).map((x) => x.attempts);
  check('[Case7] 같은 개념 반복 오답 → 최대 횟수 후 정답 정리하고 진행 (무한 반복 없음)', c2.r.directive === 'next' && Math.max(...perConcept) <= L.MAX_TRIES_PER_CONCEPT + 1 && c2.turns < 40, { perConcept, turns: c2.turns });
  const types = asks(c2.log).filter((a) => a.purpose === 'followup' || a.type === 'CHECK_UNDERSTANDING').map((a) => a.questionType ?? 'confirm');
  check('[Case7b] 오답 반복 시 질문 유형 전환 (선택형 → 상황/설명 질문), 단순 "이해됐어?"로 후퇴하지 않음', new Set(types).size >= 2 && types.includes('choice') && !types.includes('confirm'), types);
  check('[Case2b] 오답 연속 → 레벨 하향(쉬운 설명/선택형)', c2.log.some((l) => l.stage && l.actions?.some((a) => a.questionType === 'choice')) && ['easy', 'normal'].includes(c2.r.state.level));
  check('[Case2c] 이해 못 한 개념은 복습 필요로 기록', L.toLearningRecord(c2.r.state, c2.ctx).needsReview.length >= 2, L.toLearningRecord(c2.r.state, c2.ctx).needsReview);
  check('[Case2d] 기계적 "틀렸습니다/아닙니다/다시 해" 없음', !coachTexts(c2.log).some((t) => /^(틀렸|아닙니다|다시 해)/.test(t)));
}

// ---- Case 3: "모르겠어" → easier
{
  const ctx = ctxFor(armbar);
  let r = L.lessonStep(L.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  const before = r.state.pending;
  const intent = L.classifyIntent('모르겠어', r.state.pending);
  r = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '모르겠어', intent });
  const types = r.actions.map((a) => a.type);
  const re = r.actions.find((a) => a.type === 'REEXPLAIN');
  check('[Case3] "모르겠어" → 위로 + 다른(쉬운) 설명 + 더 쉬운 질문', intent === 'dont_know' && types.join(',') === 'FEEDBACK,REEXPLAIN,ASK' && r.actions[0].content.startsWith('괜찮습니다') && re.content !== ctx.concepts[0].explain && r.state.pending.text !== before.text, { types, q: r.state.pending.text, re: re?.content });
  check('[Case3b] "모르겠어" 후 질문은 선택형(쉬운 질문)', r.state.pending.type === 'choice' || r.state.pending.type === 'confirm', r.state.pending.type);
}

// ---- Case 4 + 5: student question first, then back to the lesson
{
  const ctx = ctxFor(armbar);
  let r = L.lessonStep(L.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  const pendingBefore = r.state.pending;
  const q = '근데 이거 상대가 팔을 굽히면 어떻게 해?';
  const intent = L.classifyIntent(q, r.state.pending);
  r = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: q, intent, answer: '좋은 질문입니다. 팔을 굽히면 …' });
  check('[Case4] 학생 질문 → 예정된 흐름보다 질문 답변이 먼저', intent === 'question' && r.actions[0].type === 'ANSWER' && r.state.studentQuestions.length === 1);
  check('[Case5] 답변 후 원래 질문으로 복귀 (같은 개념·같은 질문 유지)', r.state.pending.conceptId === pendingBefore.conceptId && r.actions.at(-1).question.includes(pendingBefore.text) && r.state.conceptIndex === 0);
  const r2 = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '오늘 저녁 뭐 먹지?', intent: 'question', answer: '수업과 관계없는 질문이지만…' });
  check('[Case5b] 갑자기 다른 질문 → 답한 뒤 다시 수업 질문으로', r2.actions[0].type === 'ANSWER' && r2.state.pending.text === pendingBefore.text);
  check('[Case4b] "팔꿈치?"처럼 짧은 답은 질문이 아니라 답으로 처리', L.classifyIntent('팔꿈치?', pendingBefore) === 'answer' && L.classifyIntent('왜 그래?', pendingBefore) === 'question' && L.classifyIntent('다시 설명해줘', pendingBefore) === 'repeat');
}

// ---- Case 6: "이해했어" → one verification question, not a skip
{
  const ctx = ctxFor(armbar);
  const st = L.createLessonState(armbar.id, ctx);
  let r = L.lessonStep(st, ctx, { type: 'START' });
  // Force a confirm question on a core concept.
  r.state.pending = { conceptId: 'purpose', type: 'confirm', purpose: 'check', text: '여기까지 이해되셨습니까?', choice: null, tries: 1 };
  const intent = L.classifyIntent('이해했어', r.state.pending);
  const r2 = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '이해했어', intent });
  check('[Case6] "이해했어" → 바로 넘어가지 않고 핵심 확인 질문 1회', intent === 'understood' && r2.state.pending?.purpose === 'verify_claim' && r2.state.conceptIndex === 0, r2.actions.map((a) => a.type));
  const r3 = L.lessonStep(r2.state, ctx, { type: 'STUDENT', text: '클로즈드 가드에서 팔꿈치를 펴는 관절기', intent: 'answer', analysis: A('understood', { feedback: '맞습니다.' }) });
  check('[Case6b] 확인 질문 정답 → 다음 개념으로', r3.state.conceptIndex === 1 && r3.state.understanding.concepts.purpose.status === 'understood');
  // Support concept + "네" → accepted, no extra question (no needless repetition).
  r.state.pending = { conceptId: 'kp-2', type: 'confirm', purpose: 'check', text: '여기까지 이해되셨습니까?', choice: null, tries: 1 };
  const ctx3 = { ...ctx, concepts: [...ctx.concepts, { ...ctx.concepts[2], id: 'kp-2', importance: 'support' }] };
  r.state.conceptIndex = 3;
  const r4 = L.lessonStep(r.state, ctx3, { type: 'STUDENT', text: '네', intent: L.classifyIntent('네', r.state.pending) });
  check('[Case6c] 보조 개념에 "네" → 불필요한 재확인 없이 진행', r4.state.understanding.concepts['kp-2']?.status === 'understood' && r4.state.pending?.purpose !== 'verify_claim');
}

// ---- Case 6 on a follow-up question (tries ≥ 2): still one confirmation before moving on
{
  const ctx = ctxFor(armbar);
  let r = L.lessonStep(L.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  r = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '모름', intent: 'answer', analysis: A('weak') });
  const idx = r.state.conceptIndex;
  check('[Case6d] (전제) 후속 질문 상태', r.state.pending.tries >= 2);
  const r1 = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '이해했어요', intent: L.classifyIntent('이해했어요', r.state.pending) });
  check('[Case6e] 후속 질문에서 "이해했어요" → 넘어가지 않고 한 문장 답 요청', r1.state.conceptIndex === idx && r1.state.pending?.claimed === true, r1.actions.map((a) => a.question ?? a.content));
  const r2 = L.lessonStep(r1.state, ctx, { type: 'STUDENT', text: '이해했다니까요', intent: 'understood' });
  check('[Case6f] 두 번째 "이해했어" → 부분 이해로 기록하고 진행 (갇히지 않음)', r2.state.conceptIndex === idx + 1 && r2.state.understanding.concepts.purpose.status !== 'understood');
}

// ---- partial answer → acknowledge + fill gap + deeper question
{
  const ctx = ctxFor(armbar);
  let r = L.lessonStep(L.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  const prevType = r.state.pending.type;
  r = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '팔을 잡고 당기는 기술', intent: 'answer', analysis: A('partial', { feedback: '팔을 제어한다는 점은 정확합니다. 다만 한 가지가 더 있습니다.', reexplain: '핵심은 팔꿈치를 몸 중심에 고정하는 것입니다.' }) });
  check('[P1] 부분 이해 → 맞은 부분 인정 + 빠진 부분 재설명 + 다시 질문', r.actions.map((a) => a.type).join(',') === 'FEEDBACK,REEXPLAIN,ASK' && r.state.understanding.concepts.purpose.status === 'partial' && r.state.pending.type !== prevType, r.actions.map((a) => a.type));
}

// ---- no auto-advance while waiting; ready jumps ahead but pre-practice check still runs
{
  const ctx = ctxFor(armbar);
  let r = L.lessonStep(L.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  check('[F1] 질문 대기 중에는 자동으로 다음 단계로 넘어가지 않음 (directive=teach, pending 유지)', r.directive === 'teach' && !!r.state.pending);
  r = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '준비됐어', intent: 'ready' });
  check('[F2] 설명 도중 "준비됐어" → 영상으로', r.directive === 'video');
  r = L.lessonStep(r.state, ctx, { type: 'VIDEO_DONE' });
  check('[F3] 핵심 미확인 상태에서 실습 전 확인 질문 실행 (수행 전 이해도 체크)', r.directive === 'check' && r.state.pending?.purpose === 'pre_practice' && /시작하기 전에 하나만 확인/.test(r.actions.map((a) => a.question ?? '').join(' ')));
  r = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: '팔꿈치', intent: 'answer', analysis: A('understood', { feedback: '맞습니다.' }) });
  check('[F4] 실습 전 확인 통과 → (남은 핵심 1회 확인 또는) 실습 준비', r.directive === 'ready' || r.state.pending?.purpose === 'pre_practice');
}

// ---- prior record: previously understood → diagnose first; previously weak → re-teach with note
{
  const prior = { techniqueId: armbar.id, techniqueName: 'Armbar', updatedAt: '', overall: 'partial', concepts: [{ id: 'purpose', label: '', status: 'understood' }, { id: 'kp-0', label: '', status: 'weak' }], questions: [], practiced: true, needsReview: ['x'] };
  const ctx = ctxFor(armbar, prior);
  let r = L.lessonStep(L.createLessonState(armbar.id, ctx), ctx, { type: 'START' });
  check('[R1] 지난 수업에서 이해한 개념은 설명 대신 확인 질문부터', r.state.pending.purpose === 'diagnose');
  r = L.lessonStep(r.state, ctx, { type: 'STUDENT', text: 'x', intent: 'answer', analysis: A('understood', { feedback: '맞습니다.' }) });
  check('[R2] 지난번에 어려워한 개념은 다시 짚어 줌', r.actions.some((a) => a.type === 'EXPLAIN' && a.content.includes('지난번에 어려워하셨던')));
}

// ---- recap
{
  const plan = L.buildRecap([{ name: 'Armbar', concepts: ctxFor(armbar).concepts }, { name: 'Jab', concepts: ctxFor(jab).concepts }]);
  const fb = L.recapFeedback(plan, [plan.points[0].label, plan.points[1].label]);
  check('[RC1] 수업 종료 전 복습: 핵심 세 가지 질문', /세 가지/.test(plan.question));
  check('[RC2] 복습 피드백: "두 가지는 정확합니다. 나머지는 ○○"', /두 가지는 정확합니다/.test(fb) && fb.includes(plan.points[2].label) && /여기까지/.test(fb), fb);
}

// ---- register (합쇼체) across every coach line in the runs
{
  const lines = [...coachTexts(c1.log), ...coachTexts(c2.log)];
  const bad = lines.flatMap((l) => L.informalEndings(l).map((e) => `${e} ← ${l.slice(0, 60)}`));
  check('[S1] 코치 문장 말투 일관(합쇼체, 반말·해요체 없음)', bad.length === 0, bad.slice(0, 5));
}

// ---- jab (striking technique) also flows end to end
{
  const j = run(jab, (p) => ({ text: '답', analysis: A('partial', { feedback: '방향은 맞습니다.' }) }));
  check('[J1] 타격 기술(잽)도 동일 엔진으로 완료까지 진행', j.r.directive === 'next' && j.turns < 40, j.turns);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);

if (process.env.TRANSCRIPT) {
  for (const [name, c] of [['Case1 (all correct)', c1], ['Case2 (always wrong)', c2]]) {
    console.log(`\n===== ${name}`);
    for (const l of c.log) {
      if (l.who === 'student') console.log(`  학생: ${l.text}`);
      else for (const a of l.actions) console.log(`  코치[${a.type}${a.questionType ? '/' + a.questionType : ''}]: ${a.content ?? a.question ?? a.instruction ?? (a.situation ? a.situation + ' ' + a.question : '')}`);
      if (l.event) console.log(`    (event ${l.event} → ${l.directive})`);
    }
  }
}
