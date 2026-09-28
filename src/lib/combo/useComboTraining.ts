import { useEffect, useState } from 'react';
import {
  completeCurrentTechnique,
  getComboSession,
  pauseComboSession,
  pauseRestTimer,
  resumeComboSession,
  resumeRestTimer,
  skipRestTimer,
} from './sessionStore';
import type { ComboSessionState } from './types';

const EVENTS = ['martialdex:combo-training-updated', 'storage'];

// Same tick-for-display-only pattern as todayTraining/useTrainingSessionDetail.ts —
// the actual remaining time always comes from Date.now() vs a stored
// absolute deadline, so a delayed tick (or the app going to background)
// never desyncs the displayed countdown.
export function useComboTraining() {
  const [session, setSession] = useState<ComboSessionState | null>(getComboSession);

  useEffect(() => {
    const onUpdate = () => setSession(getComboSession());
    for (const evt of EVENTS) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of EVENTS) window.removeEventListener(evt, onUpdate);
    };
  }, []);

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!session?.restTimer) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [session?.restTimer?.endTimestamp, session?.restTimer?.pausedRemainingMs]);

  return {
    session,
    completeCurrentTechnique,
    pauseRestTimer,
    resumeRestTimer,
    skipRestTimer,
    pauseComboSession,
    resumeComboSession,
  };
}
