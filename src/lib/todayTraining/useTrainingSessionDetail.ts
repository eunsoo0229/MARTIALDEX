import { useEffect, useState } from 'react';
import type { Curriculum } from '../curriculum/types';
import { getTodaySession } from './sessionStore';
import {
  advanceToNextExercise,
  cancelActiveSetTimer,
  ensureSessionDetail,
  getActiveSetElapsedMs,
  pauseRestTimer,
  pauseTrainingSession,
  recordSetResult,
  resumeRestTimer,
  resumeTrainingSession,
  setExerciseNote,
  skipRestTimer,
  startActiveSetTimer,
} from './sessionDetail';
import type { TodaySessionState } from './types';
import { readAutoProgress } from './autoProgressSetting';

const EVENTS = ['martialdex:today-training-updated', 'storage'];

// Owns the set/rep/time runtime for the in-progress "오늘의 훈련" screen. A
// fast tick just re-renders so the rest timer / set stopwatch visibly move —
// the actual remaining/elapsed time always comes from Date.now() vs a stored
// absolute timestamp (sessionDetail.ts), so a delayed tick or a
// background/foreground gap never desyncs the displayed number, and a
// time-based set auto-completes exactly at its target regardless of how
// often this hook happens to re-render.
export function useTrainingSessionDetail(curriculum?: Curriculum) {
  const [session, setSession] = useState<TodaySessionState | null>(() => {
    const s = getTodaySession();
    return s ? ensureSessionDetail(s, curriculum) : null;
  });

  useEffect(() => {
    const onUpdate = () => {
      const s = getTodaySession();
      setSession(s && !s.detail ? ensureSessionDetail(s, curriculum) : s);
    };
    for (const evt of EVENTS) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of EVENTS) window.removeEventListener(evt, onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detail = session?.detail ?? null;
  const currentExercise = detail ? detail.exercises[detail.currentExerciseIndex] : null;
  const runningSetTimer = !detail?.paused && currentExercise?.activeSetStartedAt != null;

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!detail?.restTimer && !runningSetTimer) return;
    const id = window.setInterval(() => {
      const current = getTodaySession();
      const currentDetail = current?.detail;
      if (!current || !currentDetail) return;

      const activeExercise = currentDetail.exercises[currentDetail.currentExerciseIndex];
      if (
        activeExercise?.config.mode === 'time' &&
        activeExercise.activeSetStartedAt != null &&
        activeExercise.config.targetSeconds != null &&
        getActiveSetElapsedMs(activeExercise) >= activeExercise.config.targetSeconds * 1000
      ) {
        const setIndex = activeExercise.sets.findIndex((s) => !s.completed);
        if (setIndex !== -1) {
          const updated = recordSetResult(current, currentDetail.currentExerciseIndex, setIndex, {
            actualSeconds: activeExercise.config.targetSeconds,
          });
          if (updated && readAutoProgress() && updated.detail?.exercises[currentDetail.currentExerciseIndex]?.finishedAt) {
            advanceToNextExercise(updated);
          }
        }
      }

      forceTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [
    detail?.restTimer?.endTimestamp,
    detail?.restTimer?.pausedRemainingMs,
    currentExercise?.activeSetStartedAt,
    detail?.currentExerciseIndex,
    runningSetTimer,
  ]);

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
    if (!session) return;
    const updated = recordSetResult(session, exerciseIndex, setIndex, result);
    if (updated && readAutoProgress() && updated.detail?.exercises[exerciseIndex]?.finishedAt) {
      advanceToNextExercise(updated);
    }
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
    if (session) pauseTrainingSession(session);
  }
  function resumeSession() {
    if (session) resumeTrainingSession(session);
  }

  return {
    session,
    detail,
    recordSet,
    startSetTimer,
    cancelSetTimer,
    nextExercise,
    setNote,
    pauseRest,
    resumeRest,
    skipRest,
    pauseSession,
    resumeSession,
  };
}
