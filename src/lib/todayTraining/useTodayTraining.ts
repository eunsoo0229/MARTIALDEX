import { useEffect, useState } from 'react';
import type { Curriculum } from '../curriculum/types';
import type { TodaySessionState } from './types';
import { generateTodayTrainingPlan } from './planner';
import {
  finalizeTodaySession,
  forceFinishTodaySession,
  getTodaySession,
  isSessionFullyComplete,
  markTechniqueComplete,
  setSessionNotes,
  startTodaySession,
  undoTodaySessionFinalize,
} from './sessionStore';

const SESSION_EVENTS = ['martialdex:today-training-updated', 'storage'];
const PLAN_EVENTS = [
  'martialdex:progress-updated',
  'martialdex:pose-records-updated',
  'martialdex:training-history-updated',
  'martialdex:skill-overrides-updated',
  'martialdex:curricula-updated',
  'martialdex:gym-routines-updated',
  'storage',
];

function useSynced<T>(read: () => T, events: string[]): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    for (const evt of events) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of events) window.removeEventListener(evt, onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

// Before the user has hit [훈련 시작] today, the plan is always a fresh
// preview (so Home/AI 코치 cards reflect the latest data); once a session is
// started, that session's own frozen plan is used so the walkthrough doesn't
// shift under the user's feet mid-session.
export function useTodayTraining() {
  const session = useSynced<TodaySessionState | null>(getTodaySession, SESSION_EVENTS);
  const freshPlan = useSynced(generateTodayTrainingPlan, PLAN_EVENTS);
  const plan = session?.plan ?? freshPlan;

  function start() {
    return startTodaySession(freshPlan);
  }

  function completeTechnique(techniqueId: string) {
    markTechniqueComplete(techniqueId);
  }

  function finish(curriculum?: Curriculum) {
    if (!session) return undefined;
    const actualMinutes = Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000));
    return finalizeTodaySession(session, { curriculum, actualMinutes });
  }

  // "오늘 훈련 전체 완료" — ends the session immediately without touching
  // any set already recorded and without inventing data for sets that were
  // never recorded (see forceFinishTodaySession's doc comment).
  function finishAll(curriculum?: Curriculum) {
    if (!session) return undefined;
    const actualMinutes = Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000));
    return forceFinishTodaySession(session, { curriculum, actualMinutes });
  }

  // "방금 한 훈련 취소" — reads entryId/prior-curriculum-state straight off
  // the persisted session (survives remounts) rather than a value the
  // caller had to keep in its own state; see undoTodaySessionFinalize's doc comment.
  function undoFinish(curriculum?: Curriculum) {
    if (!session) return;
    undoTodaySessionFinalize(session, curriculum);
  }

  function setNotes(notes: string | null) {
    if (!session) return;
    setSessionNotes(session, notes);
  }

  return {
    session,
    plan,
    start,
    completeTechnique,
    finish,
    finishAll,
    undoFinish,
    setNotes,
    isFullyComplete: session ? isSessionFullyComplete(session) : false,
  };
}
