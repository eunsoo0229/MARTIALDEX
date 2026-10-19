// AI 코치와 함께하는 커리큘럼 DAY 학습 — the "AI 코치와 하기" branch of a Day
// start. The "혼자 하기" branch is the existing todayTraining flow, untouched.

export type CoachMode = 'voice' | 'text';

/**
 * Per technique (driven by the Coach Lesson Engine, src/lib/coachLesson/):
 * explain (start) -> lesson (short explain ↔ question ↔ answer loop) -> videos
 * -> quiz (실습 전 확인) -> ready (wait for "준비됐어") -> posture (자세 설명, wait
 * for "준비됐어" again) -> mitt / drill / practice (timer)
 * -> practiced -> review (실습 후 질문 · 상황 판단) -> next technique.
 * After the last technique: recap (오늘의 복습) -> summary.
 */
export type CoachStep = 'explain' | 'lesson' | 'videos' | 'quiz' | 'ready' | 'posture' | 'practice' | 'practiced' | 'review' | 'mitt' | 'drill' | 'recap' | 'summary';

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
  source: import('../visualMitt/aiPlan').MittPlan['source'];
  /** After the drill: 'next' = continue to the next technique, otherwise return to that step. */
  resume: 'next' | CoachStep;
  /**
   * The technique's PRACTICE itself (instead of "N분 동안 반복" with a timer):
   * the run's length is recorded as that technique's practiced time.
   */
  asPractice?: { techniqueId: string; startedAt: number };
}

/** 솔로 드릴 as a technique's practice (wrestling / BJJ without a partner): the coach calls real cues quickly. */
export interface LessonDrillPlan {
  techniqueId: string;
  group: 'standing' | 'ground';
  cues: { id: string; call: string }[];
  focusId: string | null;
  seconds: number;
  pace: 'slow' | 'normal' | 'fast';
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
  drillPlan?: LessonDrillPlan | null;
  /** The practice the coach planned for the current technique (posture briefing → mitt → drill/timer) — see practicePlan.ts. */
  practiceSetup?: import('./practicePlan').PracticeSetup | null;
  /** Solo drills done in this lesson (calls made — what was called, nothing measured). */
  drillSessions?: { techniqueId: string; calls: number; seconds: number; finished: boolean }[];
  /** The tutor's automatic "connect what you just learned" combo was already offered. */
  lessonComboOffered?: boolean;
  /** 1:1 lesson state per technique id (what the student understood — see coachLesson/engine.ts). */
  lessons?: Record<string, import('../coachLesson/types').CoachLessonState>;
  /** End-of-day recap question (null once answered/skipped). */
  recap?: { question: string; answered: boolean } | null;
  /**
   * The coach chosen for this lesson (coachProvider/types.ts) — routes every
   * language-model call of the run. Absent on runs saved before the choice
   * existed: read with coachKindOf() as 'unknown' (never assumed to be Gemini)
   * until the user picks a coach for the rest of the run.
   */
  coachKind?: import('../coachProvider/types').CoachKind;
  /** Coach changes made during the run (shown in the transcript too). */
  coachSwitches?: { from: import('../coachProvider/types').StoredCoachKind; to: import('../coachProvider/types').CoachKind; at: string; index: number }[];
}
