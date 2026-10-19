import type { Technique } from '../../types';
import { askCoach, gradeQuizAnswer, type QuizGrade } from '../aiCoachDay/service';
import type { CoachMessage } from '../aiCoachDay/types';
import { analyzeAnswer, gradeRecap as gradeRecapWithGemini, type AnalyzeInput } from '../coachLesson/analyzer';
import { keyPointsReference } from '../coachLesson/concepts';
import type { RecapPlan } from '../coachLesson/engine';
import { evidenceAnalysis, gradeByEvidence, recapHitsByEvidence, reconcileAnalysis } from '../coachLesson/evidenceGrader';
import type { AnswerAnalysis, ScenarioItem } from '../coachLesson/types';
import { answerFromEvidence } from '../coachKnowledge/answer';
import { namesOf } from '../coachKnowledge/lookup';
import { localModelSupported } from './localModel';
import type { CoachKind } from './types';

// One lesson engine, two coaches. Everything a lesson asks a "coach" to do
// goes through this interface; the deterministic parts (lesson flow, choice
// grading, required-element grading) are shared, the language-model parts
// are split per coach:
//   gemini     → the existing Gemini functions, unchanged (grading is then
//                bounded by the deterministic grade — reconcileAnalysis).
//   martialdex → technique evidence + deterministic grading; the local model
//                only rewords grounded answers. No Gemini module is called.

export interface CoachAnswer {
  ok: true;
  text: string;
  /** Extra transparency for the UI/tests: where the answer came from. */
  source: 'gemini' | 'evidence' | 'local_model';
}
export type CoachAnswerResult = CoachAnswer | { ok: false; message: string };

export interface CoachGradeInput extends AnalyzeInput {
  scenario?: ScenarioItem | null;
}

/** aiCoachDay's QuizGrade, plus 'evidence' for the deterministic grader. */
export type QuizGradeResult = Omit<QuizGrade, 'method'> & { method: QuizGrade['method'] | 'evidence' };

export interface CoachBackend {
  kind: CoachKind;
  /** A student's free question about the technique being taught. */
  answerQuestion(input: { technique: Technique; question: string; dayContext: string; history: CoachMessage[]; place: string }): Promise<CoachAnswerResult>;
  /** A short answer to the coach's question → the engine's analysis (deterministic grade is the authority). */
  gradeAnswer(input: CoachGradeInput): Promise<AnswerAnalysis>;
  /** End-of-day recap → the labels of the core points the student named. */
  gradeRecap(technique: Technique | null, plan: RecapPlan, answer: string): Promise<string[]>;
  /** Legacy quiz (runs saved before the lesson engine existed). */
  gradeQuiz(t: Technique, question: string, answer: string): Promise<QuizGradeResult>;
}

/** Registered names + Korean names from the technique's own data ("암바") — saying the name is not answer content. */
function techniqueNames(t: Technique | null): string[] {
  return t ? namesOf(t) : [];
}

function deterministic(input: CoachGradeInput) {
  return gradeByEvidence({
    concept: input.concept,
    scenario: input.scenario ?? null,
    reference: input.reference,
    mistakes: input.technique?.posture?.commonMistakes ?? [],
    points: input.technique?.posture?.keyPoints ?? [],
    names: techniqueNames(input.technique),
    questionType: input.pending?.type ?? null,
    answer: input.answer,
  });
}

export const geminiCoach: CoachBackend = {
  kind: 'gemini',
  async answerQuestion({ technique, question, dayContext, history, place }) {
    const r = await askCoach(technique, dayContext, history, question, place);
    return r.ok ? { ok: true, text: r.text, source: 'gemini' } : r;
  },
  async gradeAnswer(input) {
    const grade = deterministic(input);
    const model = await analyzeAnswer(input);
    return reconcileAnalysis(grade, model, input.answer);
  },
  gradeRecap: (technique, plan, answer) => gradeRecapWithGemini(technique, plan, answer),
  gradeQuiz: (t, question, answer) => gradeQuizAnswer(t, question, answer),
};

export const martialdexCoach: CoachBackend = {
  kind: 'martialdex',
  async answerQuestion({ technique, question }) {
    const a = await answerFromEvidence(technique, question, { useModel: localModelSupported() });
    return { ok: true, text: a.modelNote ? `${a.text} (${a.modelNote})` : a.text, source: a.source };
  },
  async gradeAnswer(input) {
    return evidenceAnalysis(deterministic(input));
  },
  async gradeRecap(_technique, plan, answer) {
    return recapHitsByEvidence(plan.points, answer);
  },
  async gradeQuiz(t, _question, answer) {
    const g = gradeByEvidence({ concept: null, reference: keyPointsReference(t), mistakes: t.posture?.commonMistakes ?? [], points: t.posture?.keyPoints ?? [], names: techniqueNames(t), answer });
    const verdict = g.verdict === 'understood' ? 'correct' : g.verdict === 'partial' ? 'partial' : 'incorrect';
    const head = verdict === 'correct' ? '맞습니다.' : verdict === 'partial' ? '맞는 부분이 있습니다.' : '조금 다릅니다.';
    return { verdict, correct: verdict === 'correct', feedback: `${head} ${g.reason}`, method: 'evidence' };
  },
};

export function coachBackend(kind: CoachKind): CoachBackend {
  return kind === 'martialdex' ? martialdexCoach : geminiCoach;
}
