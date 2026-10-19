import type { ReviewSessionState } from './types';
import { todayDateKey } from '../dateUtil';
import { startReviewLog, updateReviewLog } from '../review/reviewLog';

// Same local-first "daily session" pattern as todayTraining/sessionStore.ts
// (12~13단계) — a new calendar day always recomputes a fresh candidate list.
// What was reviewed goes to the REVIEW log (review/reviewLog.ts, mode 'ai'),
// not to training history: reviewing a technique is not training it, so it
// no longer adds a `source: 'review'` training entry. (Entries older apps
// already wrote are left as they are.)
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
  const log = startReviewLog('ai', null, techniqueIds);
  const session: ReviewSessionState = {
    reviewLogId: log.id,
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
  if (session.reviewLogId) updateReviewLog(session.reviewLogId, (e) => ({ ...e, completedTechniqueIds: [...session.completedTechniqueIds] }));
  writeSession(session);
  return session;
}

export function isReviewSessionFullyComplete(session: ReviewSessionState): boolean {
  return session.techniqueIds.length > 0 && session.techniqueIds.every((id) => session.completedTechniqueIds.includes(id));
}

export function finalizeReviewSession(session: ReviewSessionState) {
  const finishedAt = new Date().toISOString();
  // A session started before the review log existed has no log yet — open one now.
  const logId = session.reviewLogId ?? startReviewLog('ai', null, session.techniqueIds).id;
  const log = updateReviewLog(logId, (e) => ({ ...e, completedTechniqueIds: [...session.completedTechniqueIds], finishedAt }));
  writeSession({ ...session, reviewLogId: logId, finishedAt });
  return log;
}

export function clearReviewSession(): void {
  writeSession(null);
}
