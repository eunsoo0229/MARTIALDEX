import { choiceText } from './concepts';
import { josa, OPTION_LETTERS } from './text';
import { scenarioDebrief } from './scenario';
import type {
  AnswerAnalysis,
  CoachAction,
  CoachLessonState,
  ConceptStatus,
  ConceptUnderstanding,
  LessonConcept,
  LessonDirective,
  LessonEvent,
  LessonLevel,
  LessonStepResult,
  PendingQuestion,
  QuestionType,
  ScenarioItem,
  TechniqueLearningRecord,
} from './types';

// Coach Lesson Engine — a PURE function of (state, context, event).
//
//   explain a little → ask → student answers → judge understanding →
//   (understood → move on | partial → fill the gap + ask again |
//    weak / "모르겠어" → explain another, easier way + easier question)
//
// The engine never talks for long: every teaching turn is one short
// explanation followed by a question, and it never moves on by itself while
// a question is pending. Student questions always come first, then the
// lesson returns to where it was. The voice and text UIs only render the
// returned actions; grading (AI or offline) happens before the event is fed.

/** After this many answers on one concept the coach gives the answer and moves on (no endless loop). */
export const MAX_TRIES_PER_CONCEPT = 3;
/** Correct answers in a row that raise the level (shorter explanations, harder questions). */
export const LEVEL_UP_STREAK = 2;
/** Misses in a row that lower the level (easier wording, 선택형 questions). */
export const LEVEL_DOWN_STREAK = 2;

export interface LessonContext {
  name: string;
  concepts: LessonConcept[];
  scenarios: ScenarioItem[];
  /** Key points of the whole technique (practice review reference). */
  keyPointsReference: string;
  /** What the student understood last time this technique was taught. */
  prior?: TechniqueLearningRecord | null;
}

// ---------------------------------------------------------------- helpers

const RANK: Record<ConceptStatus, number> = { unknown: 0, weak: 1, partial: 2, understood: 3 };

function clone(s: CoachLessonState): CoachLessonState {
  return {
    ...s,
    understanding: { overall: s.understanding.overall, concepts: Object.fromEntries(Object.entries(s.understanding.concepts).map(([k, v]) => [k, { ...v }])) },
    studentQuestions: [...s.studentQuestions],
    completedConcepts: [...s.completedConcepts],
    pending: s.pending ? { ...s.pending } : null,
  };
}

function conceptOf(ctx: LessonContext, id: string | null | undefined): LessonConcept | null {
  return ctx.concepts.find((c) => c.id === id) ?? null;
}

function u(state: CoachLessonState, id: string): ConceptUnderstanding {
  return (state.understanding.concepts[id] ??= { status: 'unknown', attempts: 0, explained: 0 });
}

export function overallOf(state: CoachLessonState, ctx: LessonContext): ConceptStatus {
  const statuses = ctx.concepts.map((c) => ({ c, s: state.understanding.concepts[c.id]?.status ?? 'unknown' }));
  if (statuses.length === 0) return 'unknown';
  if (statuses.every((x) => x.s === 'understood')) return 'understood';
  const core = statuses.filter((x) => x.c.importance === 'core');
  if (core.some((x) => x.s === 'weak') || core.every((x) => x.s === 'unknown')) return 'weak';
  if (statuses.every((x) => x.s === 'unknown')) return 'unknown';
  return 'partial';
}

function priorStatus(ctx: LessonContext, id: string): ConceptStatus | null {
  return ctx.prior?.concepts.find((c) => c.id === id)?.status ?? null;
}

function levelUp(l: LessonLevel): LessonLevel {
  return l === 'easy' ? 'normal' : 'advanced';
}
function levelDown(l: LessonLevel): LessonLevel {
  return l === 'advanced' ? 'normal' : 'easy';
}

function directiveFor(state: CoachLessonState): LessonDirective {
  switch (state.currentStage) {
    case 'VIDEO':
      return 'video';
    case 'PRACTICE':
      return 'ready';
    case 'PRACTICE_REVIEW':
    case 'SCENARIO_CHECK':
      return 'review';
    case 'COMPLETE':
      return 'next';
    case 'PRE_PRACTICE_CHECK':
      return 'check';
    default:
      return 'teach';
  }
}

function questionText(concept: LessonConcept, type: QuestionType): string | null {
  if (type === 'choice') return concept.choice ? choiceText(concept.choice) : null;
  return concept.questions[type] ?? null;
}

/** Picks the next question type for a concept — depends on level and on what was already asked, so two students never get the same sequence unless they answer the same way. */
function pickQuestionType(state: CoachLessonState, concept: LessonConcept, mode: 'check' | 'diagnose' | 'easier' | 'deeper', avoid: QuestionType | null): QuestionType | null {
  const has = (t: QuestionType) => t !== avoid && questionText(concept, t) !== null;
  const order: QuestionType[] =
    mode === 'easier'
      ? ['choice', 'scenario', 'explain', 'confirm']
      : mode === 'deeper'
        ? ['why', 'scenario', 'explain', 'choice']
        : mode === 'diagnose'
          ? ['why', 'scenario', 'explain']
          : state.level === 'easy'
            ? ['choice', 'explain', 'confirm']
            : state.level === 'advanced'
              ? ['why', 'scenario', 'explain']
              : concept.importance === 'support'
                ? ['confirm', 'explain']
                : // normal level, core concept: alternate "say it back" and "why" so the rhythm varies.
                  state.completedConcepts.length % 2 === 0
                  ? ['explain', 'why', 'choice']
                  : ['why', 'explain', 'choice'];
  return order.find(has) ?? (questionText(concept, 'explain') && avoid !== 'explain' ? 'explain' : questionText(concept, 'confirm') ? 'confirm' : null);
}

function ask(state: CoachLessonState, actions: CoachAction[], pending: Omit<PendingQuestion, 'tries'> & { tries?: number }, lead = ''): void {
  const p: PendingQuestion = { ...pending, tries: pending.tries ?? 1 };
  state.pending = p;
  const text = lead ? `${lead} ${p.text}` : p.text;
  if (p.purpose === 'scenario') {
    actions.push({ type: 'SCENARIO', situation: lead, question: p.text });
    return;
  }
  if (p.type === 'confirm') actions.push({ type: 'CHECK_UNDERSTANDING', question: text });
  else actions.push({ type: 'ASK', question: text, purpose: p.purpose, questionType: p.type, choice: p.choice });
}

function askConcept(state: CoachLessonState, actions: CoachAction[], concept: LessonConcept, type: QuestionType, purpose: PendingQuestion['purpose'], lead = '', tries = 1): void {
  const text = type === 'choice' && concept.choice ? concept.choice.question : (questionText(concept, type) ?? '');
  ask(state, actions, { conceptId: concept.id, type, purpose, text: type === 'choice' && concept.choice ? choiceText(concept.choice) : text, choice: type === 'choice' ? concept.choice : null, tries }, lead);
}

/** Next explanation of a concept that has NOT been used yet (never the same text twice in a row). */
function nextExplanation(state: CoachLessonState, concept: LessonConcept): string | null {
  const all = [concept.explain, ...concept.variants];
  const cu = u(state, concept.id);
  if (cu.explained >= all.length) return null;
  const text = all[cu.explained];
  cu.explained += 1;
  return text;
}

// ---------------------------------------------------------------- flow

function teachConcept(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], lead = ''): void {
  const concept = ctx.concepts[state.conceptIndex];
  if (!concept) {
    goVideo(state, ctx, actions);
    return;
  }
  const prior = priorStatus(ctx, concept.id);
  // A strong student (or one who understood this last time) is asked FIRST —
  // the explanation is skipped if they already know it.
  if ((state.level === 'advanced' || prior === 'understood') && prior !== 'weak') {
    const type = pickQuestionType(state, concept, 'diagnose', null);
    if (type) {
      state.currentStage = 'UNDERSTANDING_CHECK';
      askConcept(state, actions, concept, type, 'diagnose', [lead, prior === 'understood' ? '지난 수업에서 배운 내용을 먼저 확인해 보겠습니다.' : '설명 전에 먼저 질문 하나 드리겠습니다.'].filter(Boolean).join(' '));
      return;
    }
  }
  state.currentStage = 'EXPLANATION';
  const text = nextExplanation(state, concept) ?? concept.explain;
  const priorNote = prior === 'weak' || prior === 'partial' ? '지난번에 어려워하셨던 부분이라 한 번 더 짚고 가겠습니다. ' : '';
  actions.push({ type: 'EXPLAIN', content: `${lead ? `${lead} ` : ''}${priorNote}${text}`, conceptId: concept.id });
  const type = pickQuestionType(state, concept, 'check', null);
  if (!type) {
    // Nothing to ask about it (no data for a question) — move on rather than invent one.
    advanceConcept(state, ctx, actions);
    return;
  }
  state.currentStage = 'UNDERSTANDING_CHECK';
  askConcept(state, actions, concept, type, 'check');
}

function markUnderstood(state: CoachLessonState, conceptId: string | null, evidence: string): void {
  if (conceptId) {
    const cu = u(state, conceptId);
    cu.status = 'understood';
    cu.evidence = evidence.slice(0, 160);
  }
  state.consecutiveCorrectAnswers += 1;
  state.consecutiveMisses = 0;
  if (state.consecutiveCorrectAnswers >= LEVEL_UP_STREAK && state.level !== 'advanced') {
    state.level = levelUp(state.level);
    state.consecutiveCorrectAnswers = 0;
  }
}

function advanceConcept(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], lead = ''): void {
  const c = ctx.concepts[state.conceptIndex];
  if (c && !state.completedConcepts.includes(c.id)) state.completedConcepts.push(c.id);
  state.pending = null;
  state.conceptIndex += 1;
  if (state.conceptIndex < ctx.concepts.length) teachConcept(state, ctx, actions, lead);
  else goVideo(state, ctx, actions, lead);
}

function goVideo(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], lead = ''): void {
  state.pending = null;
  if (state.videoDone) {
    afterVideo(state, ctx, actions);
    return;
  }
  state.currentStage = 'VIDEO';
  actions.push({ type: 'EXPLAIN', content: `${lead ? `${lead} ` : ''}이제 영상으로 직접 확인해 보겠습니다. 방금 이야기한 핵심이 영상에서 어떻게 보이는지 살펴봐 주세요.` });
  actions.push({ type: 'SHOW_VIDEO' });
}

/** The weakest core concept that is not understood yet (null = all core concepts understood). */
function weakestCore(state: CoachLessonState, ctx: LessonContext): LessonConcept | null {
  const core = ctx.concepts.filter((c) => c.importance === 'core' && (state.understanding.concepts[c.id]?.status ?? 'unknown') !== 'understood');
  core.sort((a, b) => RANK[state.understanding.concepts[a.id]?.status ?? 'unknown'] - RANK[state.understanding.concepts[b.id]?.status ?? 'unknown']);
  return core[0] ?? null;
}

function afterVideo(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[]): void {
  state.videoDone = true;
  const weak = weakestCore(state, ctx);
  if (weak && (state.understanding.concepts[weak.id]?.attempts ?? 0) < MAX_TRIES_PER_CONCEPT) {
    // 수행 전 이해도 체크 — at least the core concepts, before the body moves.
    state.currentStage = 'PRE_PRACTICE_CHECK';
    const type = pickQuestionType(state, weak, state.level === 'easy' ? 'easier' : 'check', state.pending?.type ?? null) ?? 'explain';
    askConcept(state, actions, weak, type === 'confirm' ? (questionText(weak, 'explain') ? 'explain' : 'confirm') : type, 'pre_practice', '좋습니다. 이제 직접 해 볼 텐데, 시작하기 전에 하나만 확인하겠습니다.');
    return;
  }
  if (state.level !== 'advanced' && ctx.concepts.some((c) => c.id.startsWith('kp-'))) {
    state.currentStage = 'PRE_PRACTICE_CHECK';
    ask(state, actions, { conceptId: null, type: 'explain', purpose: 'video', text: '영상에서 가장 눈에 띈 핵심 동작은 무엇이었습니까? 짧게 말씀해 주세요.', choice: null });
    return;
  }
  goReady(state, actions, state.level === 'advanced' ? '핵심을 모두 정확히 이해하셨습니다. 바로 직접 해 보겠습니다.' : '좋습니다. 이제 직접 해 보겠습니다.');
}

function goReady(state: CoachLessonState, actions: CoachAction[], text: string): void {
  state.pending = null;
  state.currentStage = 'PRACTICE';
  actions.push({ type: 'PRACTICE', instruction: text });
}

const REVIEW_QUESTIONS = [
  '방금 하신 동작에서 가장 중요했던 포인트는 무엇이었습니까?',
  '아까 설명드린 것 중에서 방금 실제로 적용해 본 것은 무엇이었습니까?',
  '방금 연습하면서 가장 신경 쓴 부분은 무엇이었고, 어려웠던 점은 없었습니까?',
];

function finishTechnique(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], lead = ''): void {
  state.pending = null;
  state.currentStage = 'COMPLETE';
  state.understanding.overall = overallOf(state, ctx);
  const weak = ctx.concepts.filter((c) => (state.understanding.concepts[c.id]?.status ?? 'unknown') !== 'understood' && c.importance === 'core');
  const tail = weak.length ? ` ${weak.map((c) => `"${c.label}"`).join(', ')} 부분은 마지막 복습에서 한 번 더 확인하겠습니다.` : '';
  actions.push({ type: 'COMPLETE', content: `${lead ? `${lead} ` : ''}${ctx.name} 수업은 여기까지입니다.${tail}` });
}

// ---------------------------------------------------------------- answers

function feedbackFor(verdict: ConceptStatus, analysis: AnswerAnalysis | null | undefined): string {
  if (analysis?.feedback) return analysis.feedback;
  if (verdict === 'understood') return '맞습니다. 핵심을 정확히 짚으셨습니다.';
  if (verdict === 'partial') return '방향은 맞습니다. 다만 한 가지가 더 있습니다.';
  if (verdict === 'weak') return '그 부분은 조금 다르게 생각해 보겠습니다.';
  return '괜찮습니다. 처음 배우면 헷갈릴 수 있는 부분입니다. 쉽게 생각해 보겠습니다.';
}

/** Understood → continue where this question was leading. */
function onSuccess(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], pending: PendingQuestion, evidence: string, analysis: AnswerAnalysis | null | undefined): void {
  markUnderstood(state, pending.conceptId, evidence);
  state.attempts += 1;
  if (pending.conceptId) u(state, pending.conceptId).attempts += 1;
  const fb = feedbackFor('understood', analysis);
  switch (pending.purpose) {
    case 'pre_practice':
    case 'video': {
      actions.push({ type: 'FEEDBACK', content: fb, verdict: 'understood' });
      // Another core concept still unconfirmed? one more short check, otherwise go.
      state.pending = null;
      const weak = weakestCore(state, ctx);
      if (weak && pending.purpose === 'pre_practice' && (state.understanding.concepts[weak.id]?.attempts ?? 0) === 0 && state.level !== 'advanced') {
        const type = pickQuestionType(state, weak, 'check', null) ?? 'explain';
        askConcept(state, actions, weak, type === 'confirm' ? 'explain' : type, 'pre_practice', '하나만 더 확인하겠습니다.');
        return;
      }
      goReady(state, actions, '그럼 천천히 직접 해 보겠습니다.');
      return;
    }
    case 'practice_review':
      actions.push({ type: 'FEEDBACK', content: fb, verdict: 'understood' });
      maybeScenario(state, ctx, actions, 'understood');
      return;
    case 'scenario': {
      const s = ctx.scenarios.find((x) => x.id === pending.conceptId) ?? null;
      actions.push({ type: 'FEEDBACK', content: s ? scenarioDebrief(s, true) : fb, verdict: 'understood' });
      finishTechnique(state, ctx, actions);
      return;
    }
    default: {
      actions.push({ type: 'FEEDBACK', content: fb, verdict: 'understood' });
      const lead = pending.purpose === 'diagnose' ? '설명할 필요 없이 이미 알고 계십니다.' : '';
      advanceConcept(state, ctx, actions, lead);
    }
  }
}

/** Not (fully) understood → fill the gap a different way and ask again, easier when needed; give the answer after MAX tries. */
function onMiss(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], pending: PendingQuestion, verdict: Exclude<ConceptStatus, 'understood'>, analysis: AnswerAnalysis | null | undefined, studentText: string): void {
  state.attempts += 1;
  state.consecutiveCorrectAnswers = 0;
  state.consecutiveMisses += 1;
  if (state.consecutiveMisses >= LEVEL_DOWN_STREAK && state.level !== 'easy') {
    state.level = levelDown(state.level);
    state.consecutiveMisses = 0;
  }

  // Practice review / scenario: no loop — explain and continue.
  if (pending.purpose === 'practice_review') {
    actions.push({ type: 'FEEDBACK', content: feedbackFor(verdict, analysis), verdict });
    actions.push({ type: 'REEXPLAIN', content: analysis?.reexplain || `이 기술의 핵심을 다시 정리하면 ${ctx.keyPointsReference.split(' / ').slice(0, 2).map((x) => `"${x}"`).join(', ')}입니다.`, reason: 'practice_review' });
    maybeScenario(state, ctx, actions, verdict);
    return;
  }
  if (pending.purpose === 'scenario') {
    const s = ctx.scenarios.find((x) => x.id === pending.conceptId) ?? null;
    actions.push({ type: 'FEEDBACK', content: `${verdict === 'partial' ? '방향은 맞습니다. ' : '좋은 시도입니다. '}${s ? scenarioDebrief(s, false) : ''}`.trim(), verdict });
    finishTechnique(state, ctx, actions);
    return;
  }
  if (pending.purpose === 'video') {
    // The video question only links what was seen to the concepts — a fuzzy answer is filled in, then practice.
    actions.push({ type: 'FEEDBACK', content: feedbackFor(verdict === 'unknown' ? 'unknown' : 'partial', analysis), verdict });
    actions.push({ type: 'REEXPLAIN', content: analysis?.reexplain || `영상에서는 ${josa(ctx.keyPointsReference.split(' / ').slice(0, 2).map((x) => `"${x}"`).join(', '), '을/를')} 확인하시면 됩니다.`, reason: 'video' });
    goReady(state, actions, '그럼 그 부분에 집중해서 직접 해 보겠습니다.');
    return;
  }

  const concept = conceptOf(ctx, pending.conceptId);
  if (!concept) {
    actions.push({ type: 'FEEDBACK', content: feedbackFor(verdict, analysis), verdict });
    advanceConcept(state, ctx, actions);
    return;
  }
  const cu = u(state, concept.id);
  cu.attempts += 1;
  // The latest evidence wins: "모르겠어" means weak, not "not assessed".
  cu.status = verdict === 'unknown' ? 'weak' : verdict;
  if (verdict !== 'unknown' && studentText) cu.evidence = studentText.slice(0, 160);

  // Loop guard: after MAX tries, give the answer clearly and move on (marked for review).
  if (cu.attempts >= MAX_TRIES_PER_CONCEPT) {
    actions.push({ type: 'FEEDBACK', content: verdict === 'partial' ? '방향은 맞습니다. 정답을 정리해 드리겠습니다.' : '괜찮습니다. 이 부분은 정답을 정리해 드리겠습니다.', verdict });
    actions.push({ type: 'EXPLAIN', content: `정리하면, ${concept.reference}. 이 부분은 마지막 복습에서 한 번 더 확인하겠습니다.`, conceptId: concept.id });
    if (pending.purpose === 'pre_practice') goReady(state, actions, '그럼 이 점을 떠올리면서 직접 해 보겠습니다.');
    else advanceConcept(state, ctx, actions);
    return;
  }

  actions.push({ type: 'FEEDBACK', content: feedbackFor(verdict, analysis), verdict });

  // A different explanation every time: the analyzer's targeted one first (if it is new), then the next data variant.
  const variant = verdict === 'unknown' ? (nextExplanation(state, concept) ?? analysis?.reexplain ?? null) : (analysis?.reexplain || nextExplanation(state, concept));
  if (variant) actions.push({ type: 'REEXPLAIN', content: variant, reason: verdict, conceptId: concept.id });
  state.currentStage = 'RE_EXPLANATION';

  const mode = verdict === 'partial' ? 'deeper' : verdict === 'unknown' || state.level === 'easy' || cu.attempts >= 2 ? 'easier' : 'check';
  let type = pickQuestionType(state, concept, mode, pending.type);
  // Ran out of new data explanations → switch to a situation question instead of repeating.
  if (!variant && questionText(concept, 'scenario') && pending.type !== 'scenario') type = 'scenario';
  if (!type) {
    advanceConcept(state, ctx, actions);
    return;
  }
  const purpose = pending.purpose === 'pre_practice' ? 'pre_practice' : 'followup';
  askConcept(state, actions, concept, type, purpose, '', pending.tries + 1);
  state.currentStage = pending.purpose === 'pre_practice' ? 'PRE_PRACTICE_CHECK' : 'UNDERSTANDING_CHECK';
}

function maybeScenario(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], reviewVerdict: ConceptStatus): void {
  const s = ctx.scenarios[0];
  // 상황 판단 비중은 이해도가 높을수록 ↑ — a struggling student gets the recap instead of another test.
  const want = s && !state.scenarioAsked && (state.level === 'advanced' || (state.level === 'normal' && RANK[reviewVerdict] >= RANK.partial));
  if (!want) {
    finishTechnique(state, ctx, actions);
    return;
  }
  state.scenarioAsked = true;
  state.currentStage = 'SCENARIO_CHECK';
  ask(state, actions, { conceptId: s.id, type: 'scenario', purpose: 'scenario', text: s.question, choice: null }, `상황 하나만 생각해 보겠습니다. ${s.situation}`);
}

function localAnalysis(verdict: ConceptStatus, feedback: string): AnswerAnalysis {
  return { kind: 'answer', verdict, understood: [], missing: [], misconception: null, feedback, reexplain: null, reply: null, method: 'keyword' };
}

// ---------------------------------------------------------------- entry points

export function createLessonState(techniqueId: string, ctx: LessonContext): CoachLessonState {
  return {
    techniqueId,
    techniqueName: ctx.name,
    currentStage: 'INTRO',
    conceptIds: ctx.concepts.map((c) => c.id),
    conceptIndex: 0,
    understanding: { overall: 'unknown', concepts: Object.fromEntries(ctx.concepts.map((c) => [c.id, { status: 'unknown', attempts: 0, explained: 0 }])) },
    pending: null,
    studentQuestions: [],
    attempts: 0,
    consecutiveCorrectAnswers: 0,
    consecutiveMisses: 0,
    completedConcepts: [],
    level: ctx.prior?.overall === 'understood' ? 'advanced' : 'normal',
    practiceDone: false,
    scenarioAsked: false,
    videoDone: false,
  };
}

/** Grades a 선택형 answer locally ("B", "2번", "두 번째", or the option's words). Null when it doesn't look like a choice. */
export function gradeChoice(pending: PendingQuestion, text: string): boolean | null {
  const c = pending.choice;
  if (!c) return null;
  const t = text.trim().toLowerCase().replace(/[\s.。!?]+$/g, '');
  const ordinals = ['첫', '두', '세', '네'];
  let idx = -1;
  const letter = t.match(/^([a-d])(\s*번)?$/i) ?? t.match(/^([abcd])[.)\s]/i);
  if (letter) idx = 'abcd'.indexOf(letter[1].toLowerCase());
  const num = t.match(/^([1-4])\s*(번)?/);
  if (idx < 0 && num) idx = Number(num[1]) - 1;
  const ord = ordinals.findIndex((o) => t.startsWith(`${o} 번째`) || t.startsWith(`${o}번째`));
  if (idx < 0 && ord >= 0) idx = ord;
  if (idx < 0) {
    const hit = c.options.findIndex((o) => {
      const head = o.toLowerCase().slice(0, 12);
      return head.length >= 4 && t.includes(head);
    });
    if (hit >= 0) idx = hit;
  }
  if (idx < 0 || idx >= c.options.length) return null;
  return idx === c.answerIndex;
}

export function lessonStep(prev: CoachLessonState, ctx: LessonContext, event: LessonEvent): LessonStepResult {
  const state = clone(prev);
  const actions: CoachAction[] = [];

  if (event.type === 'START') {
    actions.push({ type: 'EXPLAIN', content: event.lead ?? `오늘은 ${josa(ctx.name, '을/를')} 배워 보겠습니다.` });
    teachConcept(state, ctx, actions);
  } else if (event.type === 'VIDEO_DONE') {
    if (state.currentStage === 'VIDEO' || !state.videoDone) afterVideo(state, ctx, actions);
  } else if (event.type === 'PRACTICE_DONE') {
    state.practiceDone = true;
    state.currentStage = 'PRACTICE_REVIEW';
    const head = event.completed ? '수고하셨습니다.' : '여기까지 하신 것도 좋습니다.';
    const q = REVIEW_QUESTIONS[(state.attempts + state.studentQuestions.length) % REVIEW_QUESTIONS.length];
    ask(state, actions, { conceptId: null, type: 'explain', purpose: 'practice_review', text: q, choice: null }, head);
  } else {
    handleStudent(state, ctx, actions, event);
  }

  state.understanding.overall = overallOf(state, ctx);
  return { state, actions, directive: directiveFor(state) };
}

function handleStudent(state: CoachLessonState, ctx: LessonContext, actions: CoachAction[], event: Extract<LessonEvent, { type: 'STUDENT' }>): void {
  const pending = state.pending;
  const intent = event.analysis?.kind === 'question' ? 'question' : event.intent;

  switch (intent) {
    case 'question': {
      // 학생 질문 최우선: answer it first, then return to exactly where the lesson was.
      state.studentQuestions.push({ text: event.text.slice(0, 300), stage: state.currentStage, conceptId: pending?.conceptId ?? ctx.concepts[state.conceptIndex]?.id ?? null, at: new Date().toISOString() });
      const answer = event.answer ?? event.analysis?.reply ?? null;
      actions.push({ type: 'ANSWER', content: answer ?? '지금은 답변을 가져오지 못했습니다. 영상이나 자세 설명을 함께 확인해 주세요.' });
      if (pending) {
        actions.push({ type: 'ASK', question: `더 궁금한 점이 있으면 편하게 물어봐 주세요. 그럼 아까 질문으로 돌아가겠습니다. ${pending.text}`, purpose: pending.purpose, questionType: pending.type, choice: pending.choice });
      } else if (state.currentStage !== 'PRACTICE' && state.currentStage !== 'VIDEO' && state.currentStage !== 'COMPLETE') {
        actions.push({ type: 'CHECK_UNDERSTANDING', question: '이해되셨습니까? 더 자세한 설명이 필요하시면 말씀해 주세요.' });
      }
      return;
    }
    case 'repeat': {
      const concept = conceptOf(ctx, pending?.conceptId) ?? ctx.concepts[Math.min(state.conceptIndex, ctx.concepts.length - 1)];
      if (!concept) return;
      const text = nextExplanation(state, concept);
      if (text) actions.push({ type: 'REEXPLAIN', content: `다른 방식으로 설명해 보겠습니다. ${text}`, reason: 'requested', conceptId: concept.id });
      else actions.push({ type: 'REEXPLAIN', content: `핵심만 다시 정리하겠습니다. ${concept.reference}.`, reason: 'requested', conceptId: concept.id });
      if (pending) {
        // Asked to re-explain twice → offer an easier (선택형) question instead of the same one.
        const easier = pending.tries >= 2 && pending.type !== 'choice' && pending.conceptId === concept.id && concept.choice;
        if (easier) askConcept(state, actions, concept, 'choice', pending.purpose === 'pre_practice' ? 'pre_practice' : 'followup', '', pending.tries + 1);
        else {
          state.pending = { ...pending, tries: pending.tries + 1 };
          actions.push({ type: 'ASK', question: pending.text, purpose: pending.purpose, questionType: pending.type, choice: pending.choice });
        }
      }
      return;
    }
    case 'dont_know': {
      if (!pending) {
        handleStudent(state, ctx, actions, { ...event, intent: 'repeat' });
        return;
      }
      onMiss(state, ctx, actions, pending, 'unknown', null, '');
      return;
    }
    case 'understood': {
      if (!pending) {
        actions.push({ type: 'FEEDBACK', content: '좋습니다.', verdict: 'understood' });
        if (state.currentStage === 'VIDEO') actions.push({ type: 'EXPLAIN', content: '영상을 다 보셨으면 "영상 확인 완료"를 눌러 주세요.' });
        return;
      }
      const concept = conceptOf(ctx, pending.conceptId);
      const hasEvidence = concept ? state.understanding.concepts[concept.id]?.status === 'understood' : false;
      if (pending.type === 'confirm') {
        // "이해했어" to "이해되셨습니까?" — a core concept is checked once with a real question (not on trust).
        if (concept && concept.importance === 'core' && !hasEvidence && state.level !== 'advanced') {
          const type = pickQuestionType(state, concept, 'check', 'confirm');
          if (type) {
            askConcept(state, actions, concept, type, 'verify_claim', '좋습니다. 그럼 확인 하나만 하겠습니다.');
            return;
          }
        }
        onSuccess(state, ctx, actions, pending, '스스로 이해했다고 답함', localAnalysis('understood', '좋습니다.'));
        return;
      }
      // An open question is pending and the student only says "이해했어": ask for a one-line answer once; the second time, trust them (never trap).
      if (pending.purpose === 'verify_claim' || pending.claimed) {
        if (concept) {
          const cu = u(state, concept.id);
          if (cu.status === 'unknown') cu.status = 'partial';
          cu.attempts += 1;
        }
        actions.push({ type: 'FEEDBACK', content: '좋습니다. 이 부분은 마지막 복습에서 한 번 더 짚어 보겠습니다.', verdict: 'partial' });
        if (pending.purpose === 'pre_practice') goReady(state, actions, '그럼 직접 해 보겠습니다.');
        else if (pending.purpose === 'practice_review') maybeScenario(state, ctx, actions, 'partial');
        else if (pending.purpose === 'scenario') finishTechnique(state, ctx, actions);
        else if (pending.purpose === 'video') goReady(state, actions, '그럼 직접 해 보겠습니다.');
        else advanceConcept(state, ctx, actions);
        return;
      }
      state.pending = { ...pending, claimed: true };
      actions.push({ type: 'ASK', question: `좋습니다. 확인 삼아 ${pending.type === 'choice' ? '답을 하나 골라' : '한 문장으로만 답해'} 주시겠습니까? ${pending.text}`, purpose: pending.purpose, questionType: pending.type, choice: pending.choice });
      return;
    }
    case 'skip': {
      if (!pending) return;
      actions.push({ type: 'FEEDBACK', content: '알겠습니다. 이 질문은 넘어가겠습니다.', verdict: 'unknown' });
      if (pending.conceptId) {
        const cu = state.understanding.concepts[pending.conceptId];
        if (cu) cu.attempts += 1;
      }
      if (pending.purpose === 'pre_practice' || pending.purpose === 'video') goReady(state, actions, '그럼 직접 해 보겠습니다.');
      else if (pending.purpose === 'practice_review') maybeScenario(state, ctx, actions, 'unknown');
      else if (pending.purpose === 'scenario') finishTechnique(state, ctx, actions);
      else advanceConcept(state, ctx, actions);
      return;
    }
    case 'ready': {
      // "준비됐어" while still learning: jump ahead, but the core concepts are still checked before practice.
      if (state.currentStage === 'VIDEO') {
        afterVideo(state, ctx, actions);
        return;
      }
      if (state.currentStage === 'PRACTICE_REVIEW' || state.currentStage === 'SCENARIO_CHECK') {
        finishTechnique(state, ctx, actions);
        return;
      }
      if (state.currentStage === 'PRACTICE' || state.currentStage === 'COMPLETE') return;
      for (let i = state.conceptIndex; i < ctx.concepts.length; i++) {
        const c = ctx.concepts[i];
        if (!state.completedConcepts.includes(c.id)) state.completedConcepts.push(c.id);
      }
      state.conceptIndex = ctx.concepts.length;
      if (!state.videoDone) goVideo(state, ctx, actions, '좋습니다. 영상부터 함께 확인하겠습니다.');
      else afterVideo(state, ctx, actions);
      return;
    }
    case 'answer': {
      if (!pending) {
        actions.push({ type: 'ANSWER', content: event.answer ?? event.analysis?.reply ?? '말씀 감사합니다.' });
        return;
      }
      // A 선택형 answer is graded locally (no API call); anything else needs the analyzer's result.
      const choice = gradeChoice(pending, event.text);
      if (choice !== null) {
        const letter = OPTION_LETTERS[pending.choice!.answerIndex];
        if (choice) onSuccess(state, ctx, actions, pending, event.text, localAnalysis('understood', '맞습니다. 정확하게 고르셨습니다.'));
        else onMiss(state, ctx, actions, pending, 'weak', localAnalysis('weak', `거의 다 왔습니다. 정답은 ${letter}입니다.`), event.text);
        return;
      }
      const analysis = event.analysis ?? null;
      const verdict: ConceptStatus = analysis?.verdict ?? 'weak';
      if (verdict === 'understood') onSuccess(state, ctx, actions, pending, event.text, analysis);
      else onMiss(state, ctx, actions, pending, verdict, analysis, event.text);
      return;
    }
  }
}

// ---------------------------------------------------------------- end-of-day recap

export interface RecapPlan {
  question: string;
  /** Core concepts of the day, labelled by technique (grading reference). */
  points: { techniqueName: string; label: string; reference: string }[];
}

export function buildRecap(items: { name: string; concepts: LessonConcept[] }[]): RecapPlan | null {
  const points = items.flatMap((it) => it.concepts.filter((c) => c.importance === 'core' && c.id !== 'purpose').map((c) => ({ techniqueName: it.name, label: c.label, reference: c.reference })));
  if (points.length === 0) return null;
  const n = Math.min(3, points.length);
  return { question: `오늘 배운 걸 마지막으로 한번 확인해 보겠습니다. 오늘 배운 기술에서 가장 중요한 포인트 ${n === 1 ? '한' : n === 2 ? '두' : '세'} 가지를 말씀해 주시겠습니까?`, points };
}

/** "좋습니다. 두 가지는 정확합니다. 마지막 하나는 ○○였습니다." */
export function recapFeedback(plan: RecapPlan, hitLabels: string[]): string {
  const n = Math.min(3, plan.points.length);
  const hits = plan.points.filter((p) => hitLabels.includes(p.label));
  const missing = plan.points.filter((p) => !hitLabels.includes(p.label)).slice(0, Math.max(0, n - hits.length));
  const words = ['', '한', '두', '세'];
  if (hits.length >= n) return `훌륭합니다. 핵심 ${words[n]} 가지를 모두 정확히 기억하고 계십니다. 오늘 수업은 여기까지입니다.`;
  const head = hits.length ? `좋습니다. ${words[Math.min(3, hits.length)]} 가지는 정확합니다.` : '괜찮습니다. 함께 정리해 보겠습니다.';
  const rest = missing.map((p) => `${p.techniqueName}의 "${p.label}"`).join(', ');
  return `${head} ${hits.length ? '나머지는' : '오늘의 핵심은'} ${rest}였습니다. 오늘 수업은 여기까지입니다.`;
}

/** Learning record for one finished technique (what a later curriculum can review). */
export function toLearningRecord(state: CoachLessonState, ctx: LessonContext): TechniqueLearningRecord {
  const concepts = ctx.concepts.map((c) => ({ id: c.id, label: c.label, status: state.understanding.concepts[c.id]?.status ?? 'unknown', evidence: state.understanding.concepts[c.id]?.evidence }));
  return {
    techniqueId: state.techniqueId,
    techniqueName: state.techniqueName,
    updatedAt: new Date().toISOString(),
    overall: overallOf(state, ctx),
    concepts,
    questions: state.studentQuestions.map((q) => q.text),
    practiced: state.practiceDone,
    needsReview: concepts.filter((c) => c.status !== 'understood').map((c) => c.label),
  };
}

/** Maps the lesson's understanding onto the existing per-technique quiz outcome. */
export function outcomeQuiz(overall: ConceptStatus): 'correct' | 'partial' | 'incorrect' | 'skipped' {
  return overall === 'understood' ? 'correct' : overall === 'partial' ? 'partial' : overall === 'weak' ? 'incorrect' : 'skipped';
}
