import type { Curriculum } from '../curriculum/types';
import { resolveTechnique, resolveTechniquesByIds } from '../userTechniques/service';
import { resolveExerciseConfig } from './exerciseDefaults';
import { readSession, writeSession, markTechniqueComplete } from './sessionStore';
import type { ExerciseRuntime, RestTimerState, TodaySessionState, TrainingSessionDetail } from './types';
import type { TrainingExerciseDetail } from '../trainingHistory/types';

// Builds the set/rep/time runtime for every technique in today's plan. Pure
// function of the plan + (optional) curriculum Day config — called once, the
// first time the set-tracking UI is opened for a session, then persisted
// alongside the existing session so it survives reload exactly like the
// legacy completedTechniqueIds list already does.
function buildSessionDetail(session: TodaySessionState, curriculum?: Curriculum): TrainingSessionDetail {
  const day = curriculum?.days.find((d) => d.day === session.plan.day) ?? null;
  const techniques = resolveTechniquesByIds(session.plan.techniqueIds);
  const exercises: ExerciseRuntime[] = techniques.map((technique) => {
    // A gym routine's own target sets/reps/rest (session.plan.gymExerciseConfig)
    // take priority over the generic resolveExerciseConfig inference — see
    // todayTraining/planner.ts's gym-routine merge. Absent for every plan
    // with no active gym routine, so this line is a no-op for existing flows.
    const config = session.plan.gymExerciseConfig?.[technique.id] ?? resolveExerciseConfig(day, technique);
    const alreadyDone = session.completedTechniqueIds.includes(technique.id);
    return {
      techniqueId: technique.id,
      config,
      sets: Array.from({ length: config.sets }, () => ({
        completed: alreadyDone,
        actualReps: null,
        actualSeconds: null,
      })),
      startedAt: alreadyDone ? session.startedAt : null,
      finishedAt: alreadyDone ? session.startedAt : null,
      activeSetStartedAt: null,
      activeSetPausedElapsedMs: null,
    };
  });
  const firstUnfinished = exercises.findIndex((e) => !e.finishedAt);
  return {
    exercises,
    currentExerciseIndex: firstUnfinished === -1 ? Math.max(0, exercises.length - 1) : firstUnfinished,
    restTimer: null,
    paused: false,
  };
}

/** Idempotent — attaches `detail` if missing, otherwise returns the session unchanged. */
export function ensureSessionDetail(session: TodaySessionState, curriculum?: Curriculum): TodaySessionState {
  if (session.detail) return session;
  const updated: TodaySessionState = { ...session, detail: buildSessionDetail(session, curriculum) };
  writeSession(updated);
  return updated;
}

function withDetail(
  session: TodaySessionState,
  mutate: (detail: TrainingSessionDetail) => TrainingSessionDetail
): TodaySessionState | null {
  const current = readSession();
  if (!current || !current.detail) return null;
  const updated: TodaySessionState = { ...current, detail: mutate(current.detail) };
  writeSession(updated);
  return updated;
}

export function recordSetResult(
  session: TodaySessionState,
  exerciseIndex: number,
  setIndex: number,
  result: {
    actualReps?: number | null;
    actualSeconds?: number | null;
    weightKg?: number | null;
    calculatedWeightKg?: number | null;
    rpe?: number | null;
  }
): TodaySessionState | null {
  const nowIso = new Date().toISOString();
  const updated = withDetail(session, (detail) => {
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

  if (updated?.detail?.exercises[exerciseIndex]?.finishedAt) {
    markTechniqueComplete(updated.detail.exercises[exerciseIndex].techniqueId);
    return readSession();
  }
  return updated;
}

/** Starts (or restarts) the Date.now()-based stopwatch for the current time-based set. */
export function startActiveSetTimer(session: TodaySessionState, exerciseIndex: number): TodaySessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    exercises: detail.exercises.map((ex, i) =>
      i === exerciseIndex ? { ...ex, activeSetStartedAt: Date.now(), activeSetPausedElapsedMs: null } : ex
    ),
  }));
}

export function cancelActiveSetTimer(session: TodaySessionState, exerciseIndex: number): TodaySessionState | null {
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

export function pauseRestTimer(session: TodaySessionState): TodaySessionState | null {
  return withDetail(session, (detail) => {
    if (!detail.restTimer || detail.restTimer.pausedRemainingMs !== null) return detail;
    return { ...detail, restTimer: { ...detail.restTimer, pausedRemainingMs: getRestRemainingMs(detail.restTimer) } };
  });
}

export function resumeRestTimer(session: TodaySessionState): TodaySessionState | null {
  return withDetail(session, (detail) => {
    if (!detail.restTimer || detail.restTimer.pausedRemainingMs === null) return detail;
    return {
      ...detail,
      restTimer: { ...detail.restTimer, endTimestamp: Date.now() + detail.restTimer.pausedRemainingMs, pausedRemainingMs: null },
    };
  });
}

export function skipRestTimer(session: TodaySessionState): TodaySessionState | null {
  return withDetail(session, (detail) => ({ ...detail, restTimer: null }));
}

/** Called on each tick — clears an expired, non-paused rest timer so the UI can show "휴식 종료". */
export function clearExpiredRestTimer(session: TodaySessionState): TodaySessionState | null {
  return withDetail(session, (detail) => {
    if (!detail.restTimer || detail.restTimer.pausedRemainingMs !== null) return detail;
    if (getRestRemainingMs(detail.restTimer) > 0) return detail;
    return { ...detail, restTimer: null };
  });
}

/** Sets (or clears, via null/'') one exercise's free-text note — carried into TrainingExerciseDetail.notes at finalize. */
export function setExerciseNote(session: TodaySessionState, exerciseIndex: number, notes: string | null): TodaySessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    exercises: detail.exercises.map((ex, i) => (i === exerciseIndex ? { ...ex, notes: notes?.trim() || null } : ex)),
  }));
}

export function advanceToNextExercise(session: TodaySessionState): TodaySessionState | null {
  return withDetail(session, (detail) => ({
    ...detail,
    currentExerciseIndex: Math.min(detail.exercises.length - 1, detail.currentExerciseIndex + 1),
    restTimer: null,
  }));
}

export function pauseTrainingSession(session: TodaySessionState): TodaySessionState | null {
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

export function resumeTrainingSession(session: TodaySessionState): TodaySessionState | null {
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

export interface ExerciseActuals {
  repsPerSet: (number | null)[];
  /** Per-set actual weight (kg), same order/length as repsPerSet — spec "헬스 운동 — 세트별 무게 지원": the full pattern (e.g. 40/45/50kg) carries forward, not just one representative value. */
  weightPerSetKg: (number | null)[];
  /** Kept alongside weightPerSetKg for any UI still showing a single "마지막 세트 Xkg" summary — walks backward from the last set to the most recent one with a recorded weight. */
  lastWeightKg: number | null;
}

/**
 * "실제 수행값을 다음 루틴에 반영" (item 2) — one entry per exercise that has
 * at least one completed set, trimmed to just the completed sets (if the
 * user planned 3 sets but only did 2, the next default is a 2-set plan, not
 * 3 with a fabricated third value). Purely a read of `detail`; never writes
 * anything itself — gymRoutine/service.ts's applyActualsToExercise is the
 * only thing that mutates a routine, and only when the user explicitly
 * confirms after the session is already finalized.
 */
export function computeSessionActuals(detail: TrainingSessionDetail): Record<string, ExerciseActuals> {
  const result: Record<string, ExerciseActuals> = {};
  for (const ex of detail.exercises) {
    const completedSets = ex.sets.filter((s) => s.completed);
    if (completedSets.length === 0) continue;
    let lastWeightKg: number | null = null;
    for (let i = completedSets.length - 1; i >= 0; i--) {
      if (completedSets[i].weightKg != null) {
        lastWeightKg = completedSets[i].weightKg ?? null;
        break;
      }
    }
    result[ex.techniqueId] = {
      repsPerSet: completedSets.map((s) => s.actualReps),
      weightPerSetKg: completedSets.map((s) => s.weightKg ?? null),
      lastWeightKg,
    };
  }
  return result;
}

export interface SessionStats {
  exerciseCount: number;
  completedSets: number;
  totalReps: number;
  totalSeconds: number;
}

export function computeSessionStats(detail: TrainingSessionDetail): SessionStats {
  let completedSets = 0;
  let totalReps = 0;
  let totalSeconds = 0;
  for (const ex of detail.exercises) {
    for (const s of ex.sets) {
      if (!s.completed) continue;
      completedSets++;
      totalReps += s.actualReps ?? 0;
      totalSeconds += s.actualSeconds ?? 0;
    }
  }
  return { exerciseCount: detail.exercises.length, completedSets, totalReps, totalSeconds };
}

/** Builds the per-exercise log to persist into trainingHistory alongside the existing summary fields. */
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
