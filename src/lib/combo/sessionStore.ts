import type { Combo, ComboSessionState, RestTimerState } from './types';
import { recordTrainingSession } from '../trainingHistory/service';
import type { TrainingExerciseDetail } from '../trainingHistory/types';

// One active combo run at a time, independent of "오늘의 훈련"'s own session
// key — starting a combo run never disturbs an in-progress curriculum
// Training Session, and vice versa.
const KEY = 'martialdex:combo-training-session';

function readSession(): ComboSessionState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ComboSessionState) : null;
  } catch {
    return null;
  }
}

function writeSession(session: ComboSessionState | null) {
  if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('martialdex:combo-training-updated'));
}

export function getComboSession(): ComboSessionState | null {
  return readSession();
}

export function startComboSession(combo: Combo, options: { totalRounds: number; restSeconds: number }): ComboSessionState {
  const session: ComboSessionState = {
    comboId: combo.id,
    techniqueIds: combo.techniqueIds,
    totalRounds: Math.max(1, options.totalRounds),
    restSeconds: Math.max(0, options.restSeconds),
    currentTechniqueIndex: 0,
    completedRounds: 0,
    restTimer: null,
    paused: false,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  writeSession(session);
  return session;
}

export function clearComboSession(): void {
  writeSession(null);
}

function withSession(mutate: (session: ComboSessionState) => ComboSessionState): ComboSessionState | null {
  const current = readSession();
  if (!current) return null;
  const updated = mutate(current);
  writeSession(updated);
  return updated;
}

export function getRestRemainingMs(restTimer: RestTimerState): number {
  if (restTimer.pausedRemainingMs !== null) return restTimer.pausedRemainingMs;
  return Math.max(0, restTimer.endTimestamp - Date.now());
}

/**
 * Advances one technique within the current round. Completing the LAST
 * technique of a round finishes that round (spec section 5 — one round is
 * one full pass through the whole sequence) — if more rounds remain, a
 * rest timer starts automatically, exactly mirroring todayTraining's
 * per-set rest behavior; if this was the final round, the session is
 * finalized immediately and one TrainingHistoryEntry is written, reusing
 * the exact same recordTrainingSession()/exerciseDetails shape "오늘의
 * 훈련" already uses (spec section 5/6 — no parallel history format).
 */
export function completeCurrentTechnique(): ComboSessionState | null {
  const current = readSession();
  if (!current || current.finishedAt) return current;

  const isLastTechnique = current.currentTechniqueIndex === current.techniqueIds.length - 1;
  if (!isLastTechnique) {
    return withSession((s) => ({ ...s, currentTechniqueIndex: s.currentTechniqueIndex + 1 }));
  }

  const completedRounds = current.completedRounds + 1;
  const isLastRound = completedRounds >= current.totalRounds;

  if (isLastRound) {
    const finishedAt = new Date().toISOString();
    const actualMinutes = Math.max(1, Math.round((Date.now() - new Date(current.startedAt).getTime()) / 60000));
    const exerciseDetails: TrainingExerciseDetail[] = current.techniqueIds.map((techniqueId) => ({
      techniqueId,
      mode: 'reps',
      sets: current.totalRounds,
      targetReps: 1,
      targetSeconds: null,
      actualReps: Array.from({ length: completedRounds }, () => 1),
      actualSeconds: Array.from({ length: completedRounds }, () => null),
      restSeconds: current.restSeconds,
      startedAt: current.startedAt,
      finishedAt,
    }));
    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: current.techniqueIds,
      completed: true,
      estimatedMinutes: actualMinutes,
      actualMinutes,
      notes: `콤보 훈련 · ${current.totalRounds}세트 완료`,
      source: 'combo',
      exerciseDetails,
    });
    return withSession((s) => ({ ...s, completedRounds, currentTechniqueIndex: 0, restTimer: null, finishedAt }));
  }

  const restTimer: RestTimerState | null =
    current.restSeconds > 0
      ? { round: completedRounds - 1, durationSeconds: current.restSeconds, endTimestamp: Date.now() + current.restSeconds * 1000, pausedRemainingMs: null }
      : null;
  return withSession((s) => ({ ...s, completedRounds, currentTechniqueIndex: 0, restTimer }));
}

export function pauseRestTimer(): ComboSessionState | null {
  return withSession((s) => {
    if (!s.restTimer || s.restTimer.pausedRemainingMs !== null) return s;
    return { ...s, restTimer: { ...s.restTimer, pausedRemainingMs: getRestRemainingMs(s.restTimer) } };
  });
}

export function resumeRestTimer(): ComboSessionState | null {
  return withSession((s) => {
    if (!s.restTimer || s.restTimer.pausedRemainingMs === null) return s;
    return { ...s, restTimer: { ...s.restTimer, endTimestamp: Date.now() + s.restTimer.pausedRemainingMs, pausedRemainingMs: null } };
  });
}

export function skipRestTimer(): ComboSessionState | null {
  return withSession((s) => ({ ...s, restTimer: null }));
}

export function pauseComboSession(): ComboSessionState | null {
  return withSession((s) => ({
    ...s,
    paused: true,
    restTimer: s.restTimer && s.restTimer.pausedRemainingMs === null ? { ...s.restTimer, pausedRemainingMs: getRestRemainingMs(s.restTimer) } : s.restTimer,
  }));
}

export function resumeComboSession(): ComboSessionState | null {
  return withSession((s) => ({
    ...s,
    paused: false,
    restTimer:
      s.restTimer && s.restTimer.pausedRemainingMs !== null
        ? { ...s.restTimer, endTimestamp: Date.now() + s.restTimer.pausedRemainingMs, pausedRemainingMs: null }
        : s.restTimer,
  }));
}
