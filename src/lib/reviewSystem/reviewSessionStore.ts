import type { ReviewSessionState } from './types';
import { todayDateKey } from '../dateUtil';
import { recordTrainingSession } from '../trainingHistory/service';

// Same local-first "daily session" pattern as todayTraining/sessionStore.ts
// (12~13단계) — a new calendar day always recomputes a fresh candidate list,
// and completion writes into the SAME trainingHistory log (source: 'review'),
// never a separate/duplicate record of what was reviewed.
const KEY = 'martialdex:review-session';

function readSession(): ReviewSessionState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReviewSessionState) : null;
  } catch {
    return null;
  }
}

function writeSession(session: ReviewSessionState | null) {
  if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('martialdex:review-session-updated'));
}

export function getTodayReviewSession(): ReviewSessionState | null {
  const session = readSession();
  if (!session || session.date !== todayDateKey()) return null;
  return session;
}

export function startReviewSession(techniqueIds: string[]): ReviewSessionState {
  const session: ReviewSessionState = {
    date: todayDateKey(),
    techniqueIds,
    completedTechniqueIds: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  writeSession(session);
  return session;
}

export function markReviewTechniqueComplete(techniqueId: string): ReviewSessionState | null {
  const session = getTodayReviewSession();
  if (!session) return null;
  if (!session.completedTechniqueIds.includes(techniqueId)) {
    session.completedTechniqueIds = [...session.completedTechniqueIds, techniqueId];
  }
  writeSession(session);
  return session;
}

export function isReviewSessionFullyComplete(session: ReviewSessionState): boolean {
  return session.techniqueIds.length > 0 && session.techniqueIds.every((id) => session.completedTechniqueIds.includes(id));
}

export function finalizeReviewSession(session: ReviewSessionState, actualMinutes?: number) {
  const entry = recordTrainingSession({
    curriculumId: null,
    dayNumber: null,
    techniqueIds: session.techniqueIds,
    completed: true,
    estimatedMinutes: session.techniqueIds.length * 7,
    actualMinutes: actualMinutes ?? null,
    notes: null,
    source: 'review',
  });
  writeSession({ ...session, finishedAt: new Date().toISOString() });
  return entry;
}

export function clearReviewSession(): void {
  writeSession(null);
}
