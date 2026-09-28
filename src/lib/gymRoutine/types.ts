import type { Weekday } from '../dateUtil';

export type { Weekday };

export interface GymRoutineExerciseTarget {
  /** A gym Technique id (martialArt === GYM_MARTIAL_ART_ID, see gymTraining/library.ts). */
  techniqueId: string;
  targetSets: number;
  /**
   * Per-set rep targets — length always kept in sync with targetSets (see
   * service.ts's updateExerciseTarget). Index i = set i's target reps; a
   * real workout is rarely uniform across sets (e.g. a 12/10/8 pyramid), so
   * this replaced a single shared value. Entries are meaningless when
   * targetSeconds is set (time-based exercise). Use setAllSetsReps() when
   * every set genuinely should share one value.
   */
  targetReps: (number | null)[];
  targetSeconds: number | null;
  /**
   * Per-set weight targets (kg) — length always kept in sync with
   * targetSets (see repository.ts's normalizeTarget and service.ts's
   * updateExerciseTarget), mirroring targetReps above: a real workout is
   * rarely uniform across sets (e.g. 40/45/50kg pyramid), so this replaced
   * a single shared value. A null entry = the user decides that set's
   * weight at execution time (bodyweight/cardio/unspecified). Use
   * setAllSetsWeight() when every set genuinely should share one value.
   */
  targetWeightKg: (number | null)[];
  restSeconds: number;
}

export interface GymRoutineDay {
  weekday: Weekday;
  /** Array order = execution/display order; reorder = splice. */
  exercises: GymRoutineExerciseTarget[];
}

export interface GymRoutine {
  id: string;
  name: string;
  /** 0-7 entries present; an absent weekday = rest day. */
  days: GymRoutineDay[];
  /** Exactly one active routine auto-loads into 오늘의 훈련 (see gymRoutine/todayResolver.ts). */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
