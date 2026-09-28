import type { ExerciseConfig } from '../curriculum/types';
import type { Weekday } from '../dateUtil';

export type TodayTrainingMode = 'curriculum' | 'ad_hoc' | 'gym_routine' | 'no_data';

export interface TodayTrainingPlan {
  mode: TodayTrainingMode;
  curriculumId: string | null;
  curriculumTitle: string | null;
  martialArt: string | null;
  day: number | null;
  dayTitle: string | null;
  goal: string | null;
  techniqueIds: string[];
  estimatedMinutes: number;
  weaknessNote: { techniqueId: string; techniqueName: string; score: number } | null;
  /**
   * Set only when today's active gym routine day (src/lib/gymRoutine/) has
   * been merged into this plan — either appended onto an active curriculum's
   * techniqueIds (mode stays 'curriculum') or standing alone (mode ===
   * 'gym_routine'). Per-technique target sets/reps/rest from the routine,
   * keyed by techniqueId — takes priority over resolveExerciseConfig's
   * generic inference in buildSessionDetail(). Absent/undefined for every
   * plan that has no active gym routine involved (existing behavior
   * unchanged).
   */
  gymExerciseConfig?: Record<string, ExerciseConfig>;
  /**
   * The SPECIFIC gym routine this plan's gym exercises (if any) were built
   * from — set in the exact same place/moment as gymExerciseConfig above
   * (todayTraining/planner.ts). This is the single source of truth for
   * "which routine is this" everywhere a screen needs to show it (e.g.
   * TrainingHub's "루틴: X" label) — ALWAYS resolve the routine's current
   * name by this id (getGymRoutine(gymRoutineId)), never by independently
   * calling getActiveGymRoutine() again. That independent-lookup pattern is
   * exactly what caused a real bug: once a session is started, its `plan`
   * (and this id) is frozen, but a screen that separately re-queries "the
   * currently active routine" sees whatever is active NOW — which can be a
   * DIFFERENT routine if the user switched the active routine after this
   * session started, showing that new routine's name above the OLD
   * routine's still-frozen exercise list. Undefined for every plan with no
   * gym routine involved (curriculum-only, ad_hoc, no_data) — existing
   * behavior unchanged.
   */
  gymRoutineId?: string | null;
  /** The weekday (KST) this plan's gym routine day was resolved for — set alongside gymRoutineId. */
  gymRoutineWeekday?: Weekday | null;
}

export interface SetRecord {
  completed: boolean;
  /** Actual reps the user performed — recorded as-is, never auto-filled to the target. */
  actualReps: number | null;
  /** Actual seconds the user held/ran a time-based set for. */
  actualSeconds: number | null;
  /** Gym-tracking-only, additive. The RAW value the user typed (meaning depends on the technique's GymWeightCalcType — see weightCalc.ts). Always stored in kg regardless of display unit. */
  weightKg?: number | null;
  /** Gym-tracking-only, additive. The ACTUAL load after applying weightCalcType — see gymTraining/weightCalc.ts's calculateActualWeightKg. Equal to weightKg for 'standard'/undefined calc types. */
  calculatedWeightKg?: number | null;
  /** Gym-tracking-only, additive. RPE 1-10. */
  rpe?: number | null;
}

export interface ExerciseRuntime {
  techniqueId: string;
  config: ExerciseConfig;
  sets: SetRecord[];
  startedAt: string | null;
  finishedAt: string | null;
  /** Date.now() timestamp when the current time-based set's stopwatch started; null when idle/completed/paused. */
  activeSetStartedAt: number | null;
  /** Non-null while the whole session is paused mid-set: the elapsed ms banked so far. */
  activeSetPausedElapsedMs: number | null;
  /** Optional free-text note for this exercise (e.g. "오른쪽 무릎이 불편해서 중량 낮춤") — carried into TrainingExerciseDetail.notes at finalize. */
  notes?: string | null;
}

export interface RestTimerState {
  exerciseIndex: number;
  setIndex: number;
  durationSeconds: number;
  /** Date.now()-based absolute deadline — recomputed on resume so drift never accumulates. */
  endTimestamp: number;
  /** Non-null while paused: the remaining ms at the moment of pausing. */
  pausedRemainingMs: number | null;
}

export interface TrainingSessionDetail {
  exercises: ExerciseRuntime[];
  currentExerciseIndex: number;
  restTimer: RestTimerState | null;
  paused: boolean;
}

export interface TodaySessionState {
  date: string; // YYYY-MM-DD — a new day always regenerates a fresh plan
  plan: TodayTrainingPlan;
  completedTechniqueIds: string[];
  startedAt: string;
  finishedAt: string | null;
  /**
   * Set/rep/time/rest tracking for the in-progress session. Optional and
   * additive — a session started before this field existed (or the simple
   * legacy checklist flow) simply has no `detail`; every consumer of
   * `completedTechniqueIds`/`finishedAt` keeps working unchanged either way.
   */
  detail?: TrainingSessionDetail;
  /** Optional whole-session note (e.g. "오늘 컨디션 좋음") — carried into TrainingHistoryEntry.notes at finalize. Distinct from each exercise's own ExerciseRuntime.notes. */
  sessionNotes?: string | null;
  /**
   * Set the moment finalizeTodaySession succeeds — makes finalize
   * idempotent. Without this, a second call on an already-`finishedAt`
   * session (observed in practice under React StrictMode's deliberate
   * double-invocation of the "session just became fully complete" effect in
   * dev, but the same non-idempotency could be hit by any other double-fire
   * of that trigger) would write a SECOND trainingHistory entry for the
   * exact same workout.
   */
  finalizedEntryId?: string;
  /**
   * Set alongside finalizedEntryId — whether the curriculum Day was ALREADY
   * complete before this finalize (see FinalizeResult.dayWasAlreadyComplete
   * in sessionStore.ts). Persisted here (not just returned from the
   * finalize call) so "훈련 취소" can be offered — and correctly avoid
   * un-completing a Day it had nothing to do with — even after the page
   * that just finalized has unmounted and remounted (e.g. the user
   * navigated to check 훈련 기록 first, then came back to cancel).
   */
  finalizeDayWasAlreadyComplete?: boolean;
}
