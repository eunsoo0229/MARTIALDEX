// A "did the user actually train" log — distinct from CurriculumProgress's
// per-day checkbox (curriculum/types.ts) and from PoseAnalysisRecord
// (poseAnalysis/types.ts, camera-analysis runs only). This is the append-only
// event log that both feed into skillProgress's practiceCount: completing a
// curriculum Day *or* finishing an ad-hoc "오늘의 훈련" session each write one
// entry here. See src/lib/skillProgress/computeSkillProgress.ts.
// 'sparring_session' (자유훈련의 규칙 설정 + 라운드 타이머 수동 기록,
// src/lib/sparringSession/) is deliberately DISTINCT from 'sparring' (the
// existing video-analysis technique-confirm path, SparringResultView.tsx) —
// different label ("스파링 분석" vs "스파링"), different source data, must
// never be merged/confused.
// 'ground_battle' and 'shadow' are removed features, kept in the union only
// so existing users' past history entries keep type-checking and rendering.
export type TrainingSource = 'curriculum' | 'coach_today' | 'sparring' | 'review' | 'combo' | 'shadow' | 'free_training' | 'gym_class' | 'sparring_session' | 'ground_battle' | 'visual_mitt';

/** Per-exercise set/rep/time log for a session recorded via the "오늘의 훈련" set-tracking flow. */
export interface TrainingExerciseDetail {
  techniqueId: string;
  mode: 'reps' | 'time';
  sets: number;
  targetReps: number | null;
  targetSeconds: number | null;
  /** Actual reps/seconds performed, one entry per completed set (in set order). */
  actualReps: (number | null)[];
  actualSeconds: (number | null)[];
  restSeconds: number;
  startedAt: string | null;
  finishedAt: string | null;
  /**
   * Gym-tracking-only, additive. Same index convention as actualReps/
   * actualSeconds (one slot per configured set, null = not completed/not
   * recorded). Canonical storage unit is always kg — see
   * gymTraining/volume.ts for kg<->lbs conversion. Absent (undefined) for
   * every entry recorded before this field existed and for every
   * non-weight-training exercise.
   */
  actualWeightKg?: (number | null)[];
  /**
   * The ACTUAL load lifted per set, after applying the technique's
   * GymWeightCalcType at record time (see gymTraining/weightCalc.ts) — e.g.
   * a dumbbell set's actualWeightKg[i] is the ONE-dumbbell value the user
   * typed, while actualCalculatedWeightKg[i] is that × 2. Every volume/
   * recovery/growth-rate calculation must read THIS field (falling back to
   * actualWeightKg when absent, which is exactly correct for 'standard'
   * exercises and every entry recorded before this field existed — for
   * those, raw input already WAS the actual load). Frozen at record time so
   * a later change to the user's bodyweight setting can never retroactively
   * change a past entry's volume.
   */
  actualCalculatedWeightKg?: (number | null)[];
  /** Snapshot of the technique's calc type AT RECORD TIME — informational only (which label/math produced actualCalculatedWeightKg), never re-read live. */
  weightCalcType?: import('../../types').GymWeightCalcType;
  /** RPE 1-10 per set, same convention as actualWeightKg. */
  actualRpe?: (number | null)[];
  /** Display-unit hint for this exercise's UI only; storage is always kg regardless. Undefined = 'kg'. */
  weightUnit?: 'kg' | 'lbs';
  /** Optional per-exercise note (e.g. "오른쪽 무릎이 불편해서 중량 낮춤") — written during the session, editable after the fact from the history detail screen. */
  notes?: string | null;
}

export interface TrainingHistoryEntry {
  id: string;
  date: string; // YYYY-MM-DD — the day this session counts toward
  completedAt: string; // ISO timestamp — when the training itself happened, never changes after creation
  /**
   * When this entry was last created OR edited (note edits) — additive,
   * absent on every entry recorded before notes became editable. Cloud
   * sync (trainingHistorySync.ts) uses this (falling back to completedAt
   * when absent) to decide "newest wins" for entries edited on one device
   * and not yet seen by another, mirroring gymRoutineSync.ts's merge —
   * entries were previously truly append-only (id-existence-only merge),
   * which broke the moment editing became possible.
   */
  updatedAt?: string;
  curriculumId: string | null;
  dayNumber: number | null;
  techniqueIds: string[];
  completed: boolean;
  estimatedMinutes: number;
  actualMinutes: number | null;
  notes: string | null;
  source: TrainingSource;
  /**
   * Set/rep/time granularity from the set-tracking "오늘의 훈련" flow.
   * Optional and additive — absent on every entry recorded before this field
   * existed (simple checklist sessions, curriculum Day completions from the
   * Day-detail page, sparring/review entries), all of which only ever read
   * the summary fields above.
   */
  exerciseDetails?: TrainingExerciseDetail[];
  /**
   * Present only for source === 'gym_class' — traces this personal entry
   * back to the gym-class session that produced it (src/lib/gymClass/).
   * Additive/optional so every existing entry and creation site (which
   * never sets this) still compiles unchanged. This is purely informational
   * for display (TrainingEntryRow/TrainingHistoryDetail) — every derived
   * system (nutrition/calendar/recovery/skillProgress/sync) reads only the
   * fields above and never branches on source or this field.
   */
  gymClassMeta?: {
    gymId: string;
    gymName: string;
    classTitle: string;
    sessionId: string;
  };
  /**
   * Present only for source === 'sparring_session' — links this history
   * entry back to its full rules record (src/lib/sparringSession/,
   * Supabase table sparring_sessions). Additive/optional, same convention
   * as gymClassMeta above. Also doubles as the idempotency key: before
   * writing a new entry, finalizeSparringSession() checks whether an entry
   * with this sparringSessionId already exists, so a duplicate save
   * click/retry never creates two history entries for the same session.
   */
  sparringSessionId?: string;
  /**
   * Set only on sessions built from a 요일별 gym routine day (todayTraining/
   * planner.ts). `weekday` is the routine day the exercises were LOADED
   * from — not when it happened (that is always `date` above). `substituted`
   * is true when the user ran a different weekday's routine today via
   * "다른 요일 루틴으로 운동하기"; the routine itself is never changed by
   * that. Additive/optional — absent on every entry recorded before this
   * field existed.
   */
  gymRoutine?: {
    routineId: string;
    /** Name snapshot at record time — the routine may be renamed/deleted later. */
    routineName: string;
    weekday: import('../dateUtil').Weekday;
    substituted: boolean;
  };
  /**
   * Set only on entries from a coach-run 체육관 실시간 훈련/스파링
   * (src/lib/gymLive/). `status` keeps COMPLETED vs INTERRUPTED (coach ended
   * early) apart, and completedSets counts only sets whose whole WORK time
   * was actually lived. The entry id is derived from sessionId, so one
   * session can never become two entries (retries, second device, sync).
   */
  gymLive?: {
    sessionId: string;
    gymId: string;
    gymName: string;
    coachUserId: string;
    kind: 'drill' | 'sparring';
    status: 'completed' | 'interrupted';
    totalSets: number;
    completedSets: number;
    workSeconds: number;
    restSeconds: number;
    startedAt: string | null;
    endedAt: string | null;
    /** Sparring only — this student's own opponent per round (null = 대기). */
    opponents?: (string | null)[];
  };
  /** Set only on entries recorded by an AI 코치 Day session — where it happened (null = place not chosen, older sessions) and how the user talked to the coach. Lets later AI 코치 수업 plans read what earlier classes covered. */
  aiCoach?: { location: 'home' | 'gym' | 'limited' | null; mode: 'voice' | 'text' };
  /**
   * Set only on AI Visualizing Mitt sessions. Everything here is what the
   * USER did/marked — the app has no camera/sensor analysis in this mode, so
   * nothing is a measured judgement of the technique (selfReported: true).
   */
  visualMitt?: {
    comboId: string | null;
    comboName: string;
    stepTechniqueIds: string[];
    /** Step indexes the user marked as practised. */
    completedSteps: number[];
    /** Full passes through the combo. */
    repetitions: number;
    stance: 'orthodox' | 'southpaw';
    selfReported: true;
    /** 카메라 타격 판정 (removed feature) — kept only for entries saved while it existed. */
    cameraPadwork?: {
      score: number;
      validStrikes: number;
      rejected: number;
      byType: { jab: number; straight: number; hook: number };
      maxCombo: number;
      rounds: { round: number; score: number; validStrikes: number }[];
    };
    /** 영상 AI 채점 (removed feature) — kept only so entries saved while it existed keep type-checking. */
    videoAnalysis?: {
      score: number | null;
      judged: number;
      hits: number;
      partial: number;
      missed: number;
      wrongHand: number;
      untracked: number;
      skipped: number;
      avgReactionMs: number | null;
      avgTimingMs: number | null;
      avgPeakSpeed: number | null;
      avgReturnMs: number | null;
      guardDrops: number;
      feedback: string | null;
    };
  };
}
