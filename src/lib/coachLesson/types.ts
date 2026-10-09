// AI 코치 1:1 수업 엔진 — types.
//
// The lesson is driven by what the student understood, not by a script
// position. Everything here is plain data (persisted inside the coach-day
// run in localStorage), so the engine stays a pure function of
// (state, event) and the voice/text UIs only render its actions.

export type ConceptStatus = 'unknown' | 'weak' | 'partial' | 'understood';

/** Where the lesson for ONE technique currently is. */
export type LessonStage =
  | 'INTRO'
  | 'EXPLANATION'
  | 'UNDERSTANDING_CHECK'
  | 'QUESTION'
  | 'RE_EXPLANATION'
  | 'VIDEO'
  | 'PRE_PRACTICE_CHECK'
  | 'PRACTICE'
  | 'PRACTICE_REVIEW'
  | 'SCENARIO_CHECK'
  | 'RECAP'
  | 'COMPLETE';

/** A: 직접 확인, B: 네 말로 설명, C: 이유, D: 상황, E: 선택. */
export type QuestionType = 'confirm' | 'explain' | 'why' | 'scenario' | 'choice';

export interface ChoiceQuestion {
  question: string;
  options: string[];
  answerIndex: number;
}

/** One teachable idea of a technique, built ONLY from MARTIALDEX data (concepts.ts). */
export interface LessonConcept {
  id: string;
  /** Short checklist label shown in the lesson progress panel. */
  label: string;
  importance: 'core' | 'support';
  /** First, short explanation (1–2 sentences). */
  explain: string;
  /** Other ways to say the same idea — used in order on re-explanation, never the same text twice in a row. */
  variants: string[];
  /** What a correct answer contains (grading reference). */
  reference: string;
  /** Content words for the offline (no-AI) grader. */
  keywords: string[];
  /** Open questions by type. */
  questions: Partial<Record<Exclude<QuestionType, 'choice'>, string>>;
  choice: ChoiceQuestion | null;
}

/** A situational-judgement item — kept separate so a future 상황 퀴즈 can reuse it. */
export interface ScenarioItem {
  id: string;
  situation: string;
  question: string;
  /** Correct line of response (from data). */
  answer: string;
  /** Why it is correct + the cue in the situation that points to it. */
  why: string;
  cue: string;
  keywords: string[];
}

export interface PendingQuestion {
  conceptId: string | null;
  type: QuestionType;
  /** What the question is for — drives what happens after the answer. */
  purpose: 'diagnose' | 'check' | 'followup' | 'verify_claim' | 'video' | 'pre_practice' | 'practice_review' | 'scenario' | 'recap';
  text: string;
  choice: ChoiceQuestion | null;
  /** Times this exact concept/purpose has been asked (for loop guard). */
  tries: number;
  /** The student already said "이해했어" instead of answering this question once. */
  claimed?: boolean;
}

export interface ConceptUnderstanding {
  status: ConceptStatus;
  evidence?: string;
  /** Answers given on this concept. */
  attempts: number;
  /** How many explanation variants were already used (index into [explain, ...variants]). */
  explained: number;
}

export type LessonLevel = 'easy' | 'normal' | 'advanced';

export interface StudentQuestionLog {
  text: string;
  stage: LessonStage;
  conceptId: string | null;
  at: string;
}

export interface CoachLessonState {
  techniqueId: string;
  techniqueName: string;
  currentStage: LessonStage;
  conceptIds: string[];
  conceptIndex: number;
  understanding: {
    overall: ConceptStatus;
    concepts: Record<string, ConceptUnderstanding>;
  };
  pending: PendingQuestion | null;
  studentQuestions: StudentQuestionLog[];
  /** Total graded answers in this technique. */
  attempts: number;
  consecutiveCorrectAnswers: number;
  consecutiveMisses: number;
  completedConcepts: string[];
  level: LessonLevel;
  practiceDone: boolean;
  scenarioAsked: boolean;
  /** Set once the video has been watched (or skipped). */
  videoDone: boolean;
}

/** What the coach does — the engine never returns a bare string. */
export type CoachAction =
  | { type: 'EXPLAIN'; content: string; conceptId?: string }
  | { type: 'ASK'; question: string; purpose: PendingQuestion['purpose']; questionType: QuestionType; choice?: ChoiceQuestion | null }
  | { type: 'REEXPLAIN'; content: string; reason: string; conceptId?: string }
  | { type: 'FEEDBACK'; content: string; verdict: ConceptStatus }
  | { type: 'ANSWER'; content: string }
  | { type: 'PRACTICE'; instruction: string }
  | { type: 'CHECK_UNDERSTANDING'; question: string }
  | { type: 'SCENARIO'; situation: string; question: string }
  | { type: 'SHOW_VIDEO' }
  | { type: 'RECAP'; content: string }
  | { type: 'COMPLETE'; content: string };

/** What the student said, classified locally (intent.ts) — no API call. */
export type StudentIntent = 'ready' | 'understood' | 'dont_know' | 'repeat' | 'skip' | 'question' | 'answer';

/** Result of grading one answer (analyzer.ts — AI first, offline fallback). */
export interface AnswerAnalysis {
  /** 'question' = the "answer" was really a question for the coach. */
  kind: 'answer' | 'question';
  verdict: ConceptStatus;
  understood: string[];
  missing: string[];
  misconception: string | null;
  /** Coach-style feedback (1–2 sentences, never a bare "틀렸습니다"). */
  feedback: string;
  /** A fresh, data-grounded re-explanation aimed at what was missed (null when understood). */
  reexplain: string | null;
  /** When kind === 'question': the coach's answer. */
  reply: string | null;
  method: 'ai' | 'keyword';
}

/** Events the engine reacts to. */
export type LessonEvent =
  | { type: 'START'; lead?: string }
  | { type: 'STUDENT'; text: string; intent: StudentIntent; analysis?: AnswerAnalysis | null; answer?: string | null }
  | { type: 'VIDEO_DONE' }
  | { type: 'PRACTICE_DONE'; completed: boolean };

/** Where the page should be after the engine ran — mapped onto the existing CoachStep UI. */
export type LessonDirective = 'teach' | 'video' | 'check' | 'ready' | 'review' | 'next';

export interface LessonStepResult {
  state: CoachLessonState;
  actions: CoachAction[];
  directive: LessonDirective;
}

/** Per-technique learning record — what a later curriculum can build on. */
export interface TechniqueLearningRecord {
  techniqueId: string;
  techniqueName: string;
  updatedAt: string;
  overall: ConceptStatus;
  concepts: { id: string; label: string; status: ConceptStatus; evidence?: string }[];
  questions: string[];
  practiced: boolean;
  needsReview: string[];
}
