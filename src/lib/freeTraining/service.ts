import type { FreeTrainingSessionState } from './types';
import { buildExerciseHistoryDetails } from './sessionDetail';
import { deleteTrainingHistoryEntry, recordTrainingSession } from '../trainingHistory/service';
import { readSession, writeSession, clearFreeTrainingSession as clearSession } from './sessionStore';

/**
 * Writes a completed free-training session into the SAME trainingHistory
 * log every other training source (curriculum/combo/오늘의 훈련/...) already
 * uses — reusing its existing Supabase-synced `training_history` table and
 * the existing 훈련 기록 조회 screens (TrainingHistoryList/Detail) instead of
 * introducing a parallel history store/table, since `exerciseDetails`
 * already captures per-technique target-vs-actual reps/seconds and
 * `TrainingSource` was widened with a 'free_training' value for this.
 */
export function finalizeFreeTrainingSession(session: FreeTrainingSessionState, actualMinutes: number): string {
  // Idempotency guard — see FreeTrainingSessionState.finalizedEntryId's doc
  // comment. Re-reads the PERSISTED session rather than trusting the
  // `session` argument, matching todayTraining/sessionStore.ts's identical
  // fix: React StrictMode's deliberate double-invocation calls this
  // function twice with the SAME closed-over (stale) session object, so
  // checking that argument alone would let both calls see `finishedAt:
  // null`. The first call's `writeSession` below completes synchronously
  // before the second call starts, so a fresh read reflects it by then.
  const persisted = readSession();
  if (persisted && persisted.id === session.id && persisted.finishedAt && persisted.finalizedEntryId) {
    return persisted.finalizedEntryId;
  }

  const entry = recordTrainingSession({
    curriculumId: null,
    dayNumber: null,
    techniqueIds: session.detail.exercises.map((e) => e.techniqueId),
    completed: true,
    estimatedMinutes: actualMinutes,
    actualMinutes,
    notes: session.sessionNotes ?? null,
    source: 'free_training',
    exerciseDetails: buildExerciseHistoryDetails(session.detail),
  });
  writeSession({ ...session, finishedAt: new Date().toISOString(), finalizedEntryId: entry.id });
  return entry.id;
}

/**
 * "방금 한 훈련 취소" (item 6) — free training never touches curriculum
 * progress, so this is simpler than todayTraining's equivalent: delete the
 * just-created history entry (removing it from every volume/calendar/stat
 * reader, all of which re-read listTrainingHistory() live) and clear the
 * session outright, exactly like starting over.
 */
export function undoFreeTrainingFinalize(entryId: string): void {
  deleteTrainingHistoryEntry(entryId);
  clearFreeTrainingSession();
}

export function clearFreeTrainingSession(): void {
  clearSession();
}
