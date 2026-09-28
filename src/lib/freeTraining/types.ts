import type { ExerciseConfig } from '../curriculum/types';
import type { ExerciseRuntime, RestTimerState, TrainingSessionDetail } from '../todayTraining/types';

// "자유훈련" — the user picks techniques directly (no AI curriculum, no
// combo save) and trains them freeform. Reuses ExerciseRuntime/
// RestTimerState/TrainingSessionDetail from todayTraining/types.ts as-is
// (identical per-technique/set/rest shape, no curriculum concept needed) so
// the runtime/pause-resume logic in freeTraining/sessionDetail.ts can mirror
// todayTraining/sessionDetail.ts's already-tested Date.now()-based mechanics
// exactly, just persisted under its own session key (see sessionStore.ts) so
// a free-training session and "오늘의 훈련" can never clobber each other.
export type { ExerciseRuntime, RestTimerState, TrainingSessionDetail };

export interface FreeTrainingEntry {
  techniqueId: string;
  config: ExerciseConfig;
}

/** The in-progress builder draft — persisted so it survives navigating to a
 * technique's detail page and back (spec section 2/25), unlike plain
 * component state which is wiped by React Router unmounting the page. */
export interface FreeTrainingDraft {
  martialArt: string;
  entries: FreeTrainingEntry[];
}

export interface FreeTrainingSessionState {
  id: string;
  martialArt: string;
  startedAt: string;
  finishedAt: string | null;
  detail: TrainingSessionDetail;
  /** Optional whole-session note — carried into TrainingHistoryEntry.notes at finalize. */
  sessionNotes?: string | null;
  /** Set the moment finalizeFreeTrainingSession succeeds — makes finalize idempotent (see todayTraining/types.ts's TodaySessionState.finalizedEntryId for why this matters). */
  finalizedEntryId?: string;
}
