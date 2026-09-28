import { useEffect, useState } from 'react';
import { readSession, isFreeSessionFullyComplete, setFreeTrainingSessionNotes, FREE_TRAINING_SESSION_EVENT } from './sessionStore';
import {
  advanceToNextExercise,
  cancelActiveSetTimer,
  getActiveSetElapsedMs,
  pauseFreeTrainingSession,
  pauseRestTimer,
  recordSetResult,
  resumeFreeTrainingSession,
  resumeRestTimer,
  setExerciseNote,
  skipRestTimer,
  startActiveSetTimer,
} from './sessionDetail';
import type { FreeTrainingSessionState } from './types';

const EVENTS = [FREE_TRAINING_SESSION_EVENT, 'storage'];

/** Mirrors todayTraining/useTrainingSessionDetail.ts's tick/timer pattern —
 * a 250ms re-render tick only; actual elapsed/remaining time always comes
 * from Date.now() vs a stored absolute timestamp, so it never desyncs. No
 * auto-progress setting here (free training has no curriculum day to
 * auto-advance a "다음 학습" pointer for) — advancing to the next technique
 * is always an explicit user action. */
export function useFreeTraining() {
  const [session, setSession] = useState<FreeTrainingSessionState | null>(() => readSession());

  useEffect(() => {
    const onUpdate = () => setSession(readSession());
    for (const evt of EVENTS) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of EVENTS) window.removeEventListener(evt, onUpdate);
    };
  }, []);

  const detail = session?.detail ?? null;
  const currentExercise = detail ? detail.exercises[detail.currentExerciseIndex] : null;
  const runningSetTimer = !detail?.paused && currentExercise?.activeSetStartedAt != null;

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!detail?.restTimer && !runningSetTimer) return;
    const id = window.setInterval(() => {
      const current = readSession();
      if (!current) return;
      const activeExercise = current.detail.exercises[current.detail.currentExerciseIndex];
      if (
        activeExercise?.config.mode === 'time' &&
        activeExercise.activeSetStartedAt != null &&
        activeExercise.config.targetSeconds != null &&
        getActiveSetElapsedMs(activeExercise) >= activeExercise.config.targetSeconds * 1000
      ) {
        const setIndex = activeExercise.sets.findIndex((s) => !s.completed);
        if (setIndex !== -1) {
          recordSetResult(current, current.detail.currentExerciseIndex, setIndex, { actualSeconds: activeExercise.config.targetSeconds });
        }
      }
      forceTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [detail?.restTimer?.endTimestamp, detail?.restTimer?.pausedRemainingMs, currentExercise?.activeSetStartedAt, detail?.currentExerciseIndex, runningSetTimer]);

  function recordSet(
    exerciseIndex: number,
    setIndex: number,
    result: {
      actualReps?: number | null;
      actualSeconds?: number | null;
      weightKg?: number | null;
      calculatedWeightKg?: number | null;
      rpe?: number | null;
    }
  ) {
    if (session) recordSetResult(session, exerciseIndex, setIndex, result);
  }
  function startSetTimer(exerciseIndex: number) {
    if (session) startActiveSetTimer(session, exerciseIndex);
  }
  function cancelSetTimer(exerciseIndex: number) {
    if (session) cancelActiveSetTimer(session, exerciseIndex);
  }
  function nextExercise() {
    if (session) advanceToNextExercise(session);
  }
  function setNote(exerciseIndex: number, notes: string | null) {
    if (session) setExerciseNote(session, exerciseIndex, notes);
  }
  function setNotes(notes: string | null) {
    if (session) setFreeTrainingSessionNotes(session, notes);
  }
  function pauseRest() {
    if (session) pauseRestTimer(session);
  }
  function resumeRest() {
    if (session) resumeRestTimer(session);
  }
  function skipRest() {
    if (session) skipRestTimer(session);
  }
  function pauseSession() {
    if (session) pauseFreeTrainingSession(session);
  }
  function resumeSession() {
    if (session) resumeFreeTrainingSession(session);
  }

  return {
    session,
    detail,
    isFullyComplete: session ? isFreeSessionFullyComplete(session) : false,
    recordSet,
    startSetTimer,
    cancelSetTimer,
    nextExercise,
    setNote,
    setNotes,
    pauseRest,
    resumeRest,
    skipRest,
    pauseSession,
    resumeSession,
  };
}
