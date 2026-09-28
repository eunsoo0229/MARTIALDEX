import { readSession, writeSession } from './sessionStore';
import type { ExerciseRuntime, FreeTrainingSessionState, RestTimerState, TrainingSessionDetail } from './types';
import type { TrainingExerciseDetail } from '../trainingHistory/types';
import { resolveTechnique } from '../userTechniques/service';

// Adapted 1:1 from todayTraining/sessionDetail.ts's already-tested
// Date.now()-based pause/resume/set-recording mechanics — kept as its own
// copy (not imported) since it reads/writes freeTraining's own session key,
// mirroring the same "own copy for a materially separate session slot"
// choice already made for combo/sessionStore.ts.

function withDetail(
  session: FreeTrainingSessionState,
  mutate: (detail: TrainingSessionDetail) => TrainingSessionDetail
): FreeTrainingSessionState | null {
  const current = readSession();
  if (!current || current.id !== session.id) return null;
  const updated: FreeTrainingSessionState = { ...current, detail: mutate(current.detail) };
  writeSession(updated);
  return updated;
}

export function recordSetResult(
  session: FreeTrainingSessionState,
  exerciseIndex: number,
  setIndex: number,
  result: {
    actualReps?: number | null;
    actualSeconds?: number | null;
    weightKg?: number | null;
    calculatedWeightKg?: number | null;
    rpe?: number | null;
  }
): FreeTrainingSessionState | null {
  const nowIso = new Date().toISOString();
  return withDetail(session, (detail) => {
    const exercises = detail.exercises.map((ex, i) => {
      if (i !== exerciseIndex) return ex;
      const sets = ex.sets.map((s, si) =>
        si === setIndex
          ? {
              completed: true,
              actualReps: result.actualReps ?? null,
              actualSeconds: result.actualSeconds ?? null,
              weightKg: result.weightKg ?? null,
              calculatedWeightKg: result.calculatedWeightKg ?? result.weightKg ?? null,
              rpe: result.rpe ?? null,
            }
          : s
      );
      const allDone = sets.every((s) => s.completed);
      return {
        ...ex,
        sets,
        startedAt: ex.startedAt ?? nowIso,
        finishedAt: allDone ? nowIso : ex.finishedAt,
        activeSetStartedAt: null,
        activeSetPausedElapsedMs: null,
      };
    });
    const exercise = exercises[exerciseIndex];
    const exerciseJustFinished = exercise?.finishedAt === nowIso;
    const isLastSet = setIndex === exercise.sets.length - 1;
    const restTimer: RestTimerState | null =
      !exerciseJustFinished && !isLastSet && exercise.config.restSeconds > 0
        ? {
            exerciseIndex,
            setIndex,
            durationSeconds: exercise.config.restSeconds,
            endTimestamp: Date.now() + exercise.config.restSeconds * 1000,
            pausedRemainingMs: null,
          }
        : null;
    return { ...detail, exercises, restTimer };
  });
}

export function startActiveSetTimer(session: FreeTrainingSessionState, exerciseIndex: number): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    exercises: detail.exercises.map((ex, i) =>
      i === exerciseIndex ? { ...ex, activeSetStartedAt: Date.now(), activeSetPausedElapsedMs: null } : ex
    ),
  }));
}

export function cancelActiveSetTimer(session: FreeTrainingSessionState, exerciseIndex: number): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    exercises: detail.exercises.map((ex, i) =>
      i === exerciseIndex ? { ...ex, activeSetStartedAt: null, activeSetPausedElapsedMs: null } : ex
    ),
  }));
}

export function getActiveSetElapsedMs(exercise: ExerciseRuntime): number {
  if (exercise.activeSetPausedElapsedMs !== null) return exercise.activeSetPausedElapsedMs;
  if (exercise.activeSetStartedAt === null) return 0;
  return Date.now() - exercise.activeSetStartedAt;
}

export function getRestRemainingMs(restTimer: RestTimerState): number {
  if (restTimer.pausedRemainingMs !== null) return restTimer.pausedRemainingMs;
  return Math.max(0, restTimer.endTimestamp - Date.now());
}

export function pauseRestTimer(session: FreeTrainingSessionState): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => {
    if (!detail.restTimer || detail.restTimer.pausedRemainingMs !== null) return detail;
    return { ...detail, restTimer: { ...detail.restTimer, pausedRemainingMs: getRestRemainingMs(detail.restTimer) } };
  });
}

export function resumeRestTimer(session: FreeTrainingSessionState): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => {
    if (!detail.restTimer || detail.restTimer.pausedRemainingMs === null) return detail;
    return {
      ...detail,
      restTimer: { ...detail.restTimer, endTimestamp: Date.now() + detail.restTimer.pausedRemainingMs, pausedRemainingMs: null },
    };
  });
}

export function skipRestTimer(session: FreeTrainingSessionState): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => ({ ...detail, restTimer: null }));
}

export function clearExpiredRestTimer(session: FreeTrainingSessionState): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => {
    if (!detail.restTimer || detail.restTimer.pausedRemainingMs !== null) return detail;
    if (getRestRemainingMs(detail.restTimer) > 0) return detail;
    return { ...detail, restTimer: null };
  });
}

/** Sets (or clears, via null/'') one exercise's free-text note — carried into TrainingExerciseDetail.notes at finalize. */
export function setExerciseNote(session: FreeTrainingSessionState, exerciseIndex: number, notes: string | null): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    exercises: detail.exercises.map((ex, i) => (i === exerciseIndex ? { ...ex, notes: notes?.trim() || null } : ex)),
  }));
}

export function advanceToNextExercise(session: FreeTrainingSessionState): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    currentExerciseIndex: Math.min(detail.exercises.length - 1, detail.currentExerciseIndex + 1),
    restTimer: null,
  }));
}

export function pauseFreeTrainingSession(session: FreeTrainingSessionState): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    paused: true,
    restTimer:
      detail.restTimer && detail.restTimer.pausedRemainingMs === null
        ? { ...detail.restTimer, pausedRemainingMs: getRestRemainingMs(detail.restTimer) }
        : detail.restTimer,
    exercises: detail.exercises.map((ex) =>
      ex.activeSetStartedAt !== null
        ? { ...ex, activeSetStartedAt: null, activeSetPausedElapsedMs: getActiveSetElapsedMs(ex) }
        : ex
    ),
  }));
}

export function resumeFreeTrainingSession(session: FreeTrainingSessionState): FreeTrainingSessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    paused: false,
    restTimer:
      detail.restTimer && detail.restTimer.pausedRemainingMs !== null
        ? { ...detail.restTimer, endTimestamp: Date.now() + detail.restTimer.pausedRemainingMs, pausedRemainingMs: null }
        : detail.restTimer,
    exercises: detail.exercises.map((ex) =>
      ex.activeSetPausedElapsedMs !== null
        ? { ...ex, activeSetStartedAt: Date.now() - ex.activeSetPausedElapsedMs, activeSetPausedElapsedMs: null }
        : ex
    ),
  }));
}

export interface FreeTrainingSessionStats {
  exerciseCount: number;
  completedSets: number;
  totalSets: number;
  totalReps: number;
  totalSeconds: number;
}

export function computeFreeTrainingStats(detail: TrainingSessionDetail): FreeTrainingSessionStats {
  let completedSets = 0;
  let totalSets = 0;
  let totalReps = 0;
  let totalSeconds = 0;
  for (const ex of detail.exercises) {
    for (const s of ex.sets) {
      totalSets++;
      if (!s.completed) continue;
      completedSets++;
      totalReps += s.actualReps ?? 0;
      totalSeconds += s.actualSeconds ?? 0;
    }
  }
  return { exerciseCount: detail.exercises.length, completedSets, totalSets, totalReps, totalSeconds };
}

export function buildExerciseHistoryDetails(detail: TrainingSessionDetail): TrainingExerciseDetail[] {
  return detail.exercises.map((ex) => ({
    techniqueId: ex.techniqueId,
    mode: ex.config.mode,
    sets: ex.config.sets,
    targetReps: ex.config.targetReps,
    targetSeconds: ex.config.targetSeconds,
    actualReps: ex.sets.map((s) => s.actualReps),
    actualSeconds: ex.sets.map((s) => s.actualSeconds),
    restSeconds: ex.config.restSeconds,
    startedAt: ex.startedAt,
    finishedAt: ex.finishedAt,
    actualWeightKg: ex.sets.map((s) => s.weightKg ?? null),
    actualCalculatedWeightKg: ex.sets.map((s) => s.calculatedWeightKg ?? s.weightKg ?? null),
    weightCalcType: resolveTechnique(ex.techniqueId)?.gymWeightCalcType,
    actualRpe: ex.sets.map((s) => s.rpe ?? null),
    notes: ex.notes ?? null,
  }));
}
