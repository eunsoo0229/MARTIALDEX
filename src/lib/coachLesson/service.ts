import type { Technique } from '../../types';
import { askCoach } from '../aiCoachDay/service';
import type { CoachMessage } from '../aiCoachDay/types';
import { resolveTechniquesByIds } from '../userTechniques/service';
import { analyzeAnswer } from './analyzer';
import { buildConcepts, keyPointsReference, lessonName } from './concepts';
import { createLessonState, gradeChoice, lessonStep, type LessonContext } from './engine';
import { classifyIntent } from './intent';
import { getLearningRecord } from './records';
import { buildScenarios } from './scenario';
import { firstSentence } from './text';
import type { CoachAction, CoachLessonState, LessonStepResult } from './types';

// The one entry point both the voice UI and the text UI use:
//
//   student utterance (STT transcript or typed) → intent (local)
//     → question: coach answers (1 AI call)          ┐
//     → answer:   meaning-based analysis (1 AI call) ├→ Coach Lesson Engine → actions
//     → 모르겠어 / 다시 / 이해했어 / 건너뛰기 (no call) ┘
//
// The UI never decides the lesson flow — it renders actions and speaks them.

/** Lesson context for a technique, rebuilt deterministically from MARTIALDEX data (never persisted). */
export function lessonContextFor(t: Technique): LessonContext {
  const related = resolveTechniquesByIds(t.relatedTechniques.slice(0, 6));
  const distractors = related.map((r) => firstSentence(r.posture?.overview)).filter(Boolean).slice(0, 2);
  return {
    name: lessonName(t),
    concepts: buildConcepts(t, { distractors }),
    scenarios: buildScenarios(t),
    keyPointsReference: keyPointsReference(t),
    prior: getLearningRecord(t.id),
  };
}

export function startLesson(t: Technique, lead?: string): LessonStepResult {
  const ctx = lessonContextFor(t);
  return lessonStep(createLessonState(t.id, ctx), ctx, { type: 'START', lead });
}

const STAGE_LABEL: Record<CoachLessonState['currentStage'], string> = {
  INTRO: '소개',
  EXPLANATION: '설명',
  UNDERSTANDING_CHECK: '이해도 확인',
  QUESTION: '학생 질문',
  RE_EXPLANATION: '재설명',
  VIDEO: '영상 확인',
  PRE_PRACTICE_CHECK: '실습 전 확인',
  PRACTICE: '실습',
  PRACTICE_REVIEW: '실습 후 확인',
  SCENARIO_CHECK: '상황 판단',
  RECAP: '복습',
  COMPLETE: '완료',
};

/** Where the lesson is — given to the AI so "왜 그래?" / "그건 뭐야?" is understood in context. */
export function lessonPositionContext(state: CoachLessonState, ctx: LessonContext): string {
  const concept = ctx.concepts.find((c) => c.id === state.pending?.conceptId) ?? ctx.concepts[Math.min(state.conceptIndex, ctx.concepts.length - 1)];
  return [
    '[지금 수업 위치]',
    `단계: ${STAGE_LABEL[state.currentStage]}`,
    concept ? `지금 다루는 개념: ${concept.label} — ${concept.reference}` : '',
    state.pending ? `코치가 학생에게 마지막으로 한 질문: ${state.pending.text}` : '',
    '학생의 질문이 짧거나 모호하면("왜 그래?", "그건 뭐야?") 위 개념과 마지막 코치 발화를 가리키는 것으로 이해하고 답한다. 2~3문장으로 답하고, 되묻는 질문으로 끝내지 않는다.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface RespondInput {
  technique: Technique;
  state: CoachLessonState;
  text: string;
  dayContext: string;
  history: CoachMessage[];
  place: string;
}

export async function respondToStudent(input: RespondInput): Promise<LessonStepResult> {
  const { technique, state, text } = input;
  const ctx = lessonContextFor(technique);
  const intent = classifyIntent(text, state.pending);

  if (intent === 'question') {
    const res = await askCoach(technique, input.dayContext, input.history, text, [input.place, lessonPositionContext(state, ctx)].filter(Boolean).join('\n\n'));
    return lessonStep(state, ctx, { type: 'STUDENT', text, intent, answer: res.ok ? res.text : `지금은 답변을 가져오지 못했습니다: ${res.message}` });
  }

  if (intent === 'answer' && state.pending && gradeChoice(state.pending, text) === null) {
    const concept = ctx.concepts.find((c) => c.id === state.pending!.conceptId) ?? null;
    const scenario = ctx.scenarios.find((s) => s.id === state.pending!.conceptId) ?? null;
    const reference = scenario ? `${scenario.answer} (${scenario.why})` : ctx.keyPointsReference;
    const used = concept ? [concept.explain, ...concept.variants].slice(0, state.understanding.concepts[concept.id]?.explained ?? 1) : [];
    const analysis = await analyzeAnswer({ technique, concept, reference, pending: state.pending, answer: text, level: state.level, alreadyExplained: used, place: input.place });
    return lessonStep(state, ctx, { type: 'STUDENT', text, intent, analysis, answer: analysis.reply });
  }

  return lessonStep(state, ctx, { type: 'STUDENT', text, intent });
}

export function lessonEvent(t: Technique, state: CoachLessonState, event: { type: 'VIDEO_DONE' } | { type: 'PRACTICE_DONE'; completed: boolean } | { type: 'SKIP' }): LessonStepResult {
  const ctx = lessonContextFor(t);
  if (event.type === 'SKIP') return lessonStep(state, ctx, { type: 'STUDENT', text: '건너뛰기', intent: 'skip' });
  return lessonStep(state, ctx, event);
}

/** Coach actions → transcript lines (kinds the existing chat UI and QA already know). */
export function actionsToMessages(actions: CoachAction[]): Omit<CoachMessage, 'id' | 'at'>[] {
  const out: Omit<CoachMessage, 'id' | 'at'>[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'EXPLAIN':
      case 'REEXPLAIN':
        out.push({ role: 'coach', kind: 'explain', text: a.content });
        break;
      case 'RECAP':
        out.push({ role: 'coach', kind: 'explain', text: a.content });
        break;
      case 'ASK':
        out.push({ role: 'coach', kind: 'quiz', text: a.question });
        break;
      case 'CHECK_UNDERSTANDING':
        out.push({ role: 'coach', kind: 'quiz', text: a.question });
        break;
      case 'SCENARIO':
        out.push({ role: 'coach', kind: 'quiz', text: `${a.situation} ${a.question}`.trim() });
        break;
      case 'FEEDBACK':
        out.push({ role: 'coach', kind: 'feedback', text: a.content });
        break;
      case 'ANSWER':
        out.push({ role: 'coach', kind: 'answer', text: a.content });
        break;
      case 'PRACTICE':
        out.push({ role: 'coach', kind: 'system', text: a.instruction });
        break;
      case 'COMPLETE':
        out.push({ role: 'coach', kind: 'system', text: a.content });
        break;
      case 'SHOW_VIDEO':
        break;
    }
  }
  return out;
}
