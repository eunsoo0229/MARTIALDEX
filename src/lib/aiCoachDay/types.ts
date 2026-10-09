// AI 코치와 함께하는 커리큘럼 DAY 학습 — the "AI 코치와 하기" branch of a Day
// start. The "혼자 하기" branch is the existing todayTraining flow, untouched.

export type CoachMode = 'voice' | 'text';

/**
 * Per technique (driven by the Coach Lesson Engine, src/lib/coachLesson/):
 * explain (start) -> lesson (short explain ↔ question ↔ answer loop) -> videos
 * -> quiz (실습 전 확인) -> ready (wait for "준비됐어") -> practice (timer)
 * -> practiced -> review (실습 후 질문 · 상황 판단) -> next technique.
 * After the last technique: recap (오늘의 복습) -> summary.
 */
export type CoachStep = 'explain' | 'lesson' | 'videos' | 'quiz' | 'ready' | 'practice' | 'practiced' | 'review' | 'mitt' | 'recap' | 'summary';

/** A Visualizing Mitt drill the tutor started inside the lesson (technique ids only — rebuilt on load). */
export interface LessonMittPlan {
  techniqueIds: string[];
  name: string;
  type: 'combo' | 'setup';
  purpose: string;
  repetitions: number;
  speed: 'slow' | 'normal' | 'fast';
  reason: string;
  coachingNote: string;
  stepNotes: { techniqueId: string; note: string; opponentReaction: string | null }[];
  source: 'ai' | 'lesson';
  /** After the drill: 'next' = continue to the next technique, otherwise return to that step. */
  resume: 'next' | CoachStep;
}

export interface CoachMessage {
  id: string;
  role: 'coach' | 'user';
  text: string;
  /** Timer announcements are tagged so the UI can style them (and tests can find them). */
  kind?: 'cue' | 'explain' | 'quiz' | 'feedback' | 'answer' | 'system';
  at: string;
}

export interface PracticeRun {
  techniqueId: string;
  totalSeconds: number;
  startedAt: string;
  /** Date.now()-absolute deadline — same drift-free mechanic as sparringSession. */
  phaseEndTimestamp: number;
  pausedRemainingMs: number | null;
  paused: boolean;
  /** Cue ids already fired in THIS run — each cue fires at most once. */
  firedCueIds: string[];
}

export interface TechniqueOutcome {
  practicedSeconds: number;
  completed: boolean;
  quiz: 'correct' | 'partial' | 'incorrect' | 'skipped' | null;
  /** Overall understanding judged by the lesson engine (absent on older runs). */
  understanding?: import('../coachLesson/types').ConceptStatus;
}

export interface CoachDayRun {
  id: string;
  curriculumId: string;
  day: number;
  mode: CoachMode;
  techniqueIds: string[];
  index: number;
  step: CoachStep;
  messages: CoachMessage[];
  practice: PracticeRun | null;
  outcomes: Record<string, TechniqueOutcome>;
  /** The quiz question currently awaiting an answer, if any. */
  pendingQuiz: string | null;
  startedAt: string;
  finishedAt: string | null;
  historyEntryId: string | null;
  /** 집/체육관 chosen before the class started (AI 코치 수업 curricula carry it in aiCoachMeta). Absent on runs saved before this field existed. */
  location?: import('../aiCoachCurriculum/types').CoachLocation | null;
  /** Equipment ids the user confirmed for this class (aiCoachCurriculum/location.ts). */
  equipment?: string[];
  /** The drill currently shown in the 'mitt' step. */
  mittPlan?: LessonMittPlan | null;
  /** Drills done in this lesson (what the user did — nothing is measured). */
  mittSessions?: { name: string; techniqueIds: string[]; completedReps: number; targetReps: number; finished: boolean }[];
  /** The tutor's automatic "connect what you just learned" combo was already offered. */
  lessonComboOffered?: boolean;
  /** 1:1 lesson state per technique id (what the student understood — see coachLesson/engine.ts). */
  lessons?: Record<string, import('../coachLesson/types').CoachLessonState>;
  /** End-of-day recap question (null once answered/skipped). */
  recap?: { question: string; answered: boolean } | null;
}
