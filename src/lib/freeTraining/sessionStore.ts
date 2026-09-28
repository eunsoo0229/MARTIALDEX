import type { FreeTrainingDraft, FreeTrainingSessionState } from './types';
import { resolveTechniquesByIds } from '../userTechniques/service';

// Own session key — deliberately separate from todayTraining's
// 'martialdex:today-training-session' so a free-training run and "오늘의
// 훈련" can be independently in-progress without one overwriting the other
// (CurriculumTrainingStart.tsx already has to warn/confirm before
// overwriting today's single slot; free training avoids that class of
// conflict entirely by having its own slot).
const KEY = 'martialdex:free-training-session';
const EVENT = 'martialdex:free-training-session-updated';

export function readSession(): FreeTrainingSessionState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FreeTrainingSessionState) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: FreeTrainingSessionState | null) {
  if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Builds the runtime session from a builder draft — every technique id in
 * the draft must resolve to a real technique (official or user-added); any
 * that don't are silently dropped rather than crashing the session. */
export function startFreeTrainingSession(draft: FreeTrainingDraft): FreeTrainingSessionState | null {
  const techniques = resolveTechniquesByIds(draft.entries.map((e) => e.techniqueId));
  if (techniques.length === 0) return null;
  const entryByTechniqueId = new Map(draft.entries.map((e) => [e.techniqueId, e]));

  const session: FreeTrainingSessionState = {
    id: newId(),
    martialArt: draft.martialArt,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    detail: {
      exercises: techniques.map((t) => ({
        techniqueId: t.id,
        config: entryByTechniqueId.get(t.id)!.config,
        sets: Array.from({ length: entryByTechniqueId.get(t.id)!.config.sets }, () => ({
          completed: false,
          actualReps: null,
          actualSeconds: null,
        })),
        startedAt: null,
        finishedAt: null,
        activeSetStartedAt: null,
        activeSetPausedElapsedMs: null,
      })),
      currentExerciseIndex: 0,
      restTimer: null,
      paused: false,
    },
  };
  writeSession(session);
  return session;
}

export function isFreeSessionFullyComplete(session: FreeTrainingSessionState): boolean {
  return session.detail.exercises.length > 0 && session.detail.exercises.every((e) => !!e.finishedAt);
}

/** Sets (or clears) the whole-session note — carried into TrainingHistoryEntry.notes at finalize. */
export function setFreeTrainingSessionNotes(session: FreeTrainingSessionState, notes: string | null): FreeTrainingSessionState {
  const updated: FreeTrainingSessionState = { ...session, sessionNotes: notes?.trim() || null };
  writeSession(updated);
  return updated;
}

export function clearFreeTrainingSession(): void {
  writeSession(null);
}

export { KEY as FREE_TRAINING_SESSION_KEY, EVENT as FREE_TRAINING_SESSION_EVENT };
