import { useEffect, useState } from 'react';
import type { ReviewSessionState } from './types';
import { buildTodayReviewPlan, computeReviewCandidates, type TodayReviewPlan } from './reviewEngine';
import {
  finalizeReviewSession,
  getTodayReviewSession,
  isReviewSessionFullyComplete,
  markReviewTechniqueComplete,
  startReviewSession,
} from './reviewSessionStore';

const SESSION_EVENTS = ['martialdex:review-session-updated', 'storage'];
const PLAN_EVENTS = [
  'martialdex:pose-records-updated',
  'martialdex:training-history-updated',
  'martialdex:skill-overrides-updated',
  'martialdex:sparring-sessions-updated',
  'martialdex:review-log-updated',
  'martialdex:coach-lesson-log-updated',
  'martialdex:review-focus-updated',
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

// Before [복습 시작], the plan is always a fresh preview (reflects the
// latest scores/records); once started, the session's own frozen technique
// list is used so the walkthrough doesn't shift mid-session.
export function useReviewSession() {
  const session = useSynced<ReviewSessionState | null>(getTodayReviewSession, SESSION_EVENTS);
  const freshPlan = useSynced<TodayReviewPlan>(() => buildTodayReviewPlan(computeReviewCandidates()), PLAN_EVENTS);
  const techniqueIds = session?.techniqueIds ?? freshPlan.actionable.map((c) => c.techniqueId);

  function start() {
    return startReviewSession(freshPlan.actionable.map((c) => c.techniqueId));
  }

  function completeTechnique(techniqueId: string) {
    markReviewTechniqueComplete(techniqueId);
  }

  function finish() {
    if (!session) return;
    finalizeReviewSession(session);
  }

  return {
    session,
    plan: freshPlan,
    techniqueIds,
    start,
    completeTechnique,
    finish,
    isFullyComplete: session ? isReviewSessionFullyComplete(session) : false,
  };
}
