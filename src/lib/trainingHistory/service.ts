import type { TrainingExerciseDetail, TrainingHistoryEntry, TrainingSource } from './types';
import { trainingHistoryRepository } from './repository';
import { todayDateKey } from '../dateUtil';


function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function recordTrainingSession(input: {
  curriculumId: string | null;
  dayNumber: number | null;
  techniqueIds: string[];
  completed: boolean;
  estimatedMinutes: number;
  actualMinutes?: number | null;
  notes?: string | null;
  source: TrainingSource;
  exerciseDetails?: TrainingExerciseDetail[];
  gymClassMeta?: TrainingHistoryEntry['gymClassMeta'];
  sparringSessionId?: string;
  groundBattleMatchId?: string;
}): TrainingHistoryEntry {
  const now = new Date().toISOString();
  const entry: TrainingHistoryEntry = {
    id: newId(),
    date: todayDateKey(),
    completedAt: now,
    updatedAt: now,
    curriculumId: input.curriculumId,
    dayNumber: input.dayNumber,
    techniqueIds: input.techniqueIds,
    completed: input.completed,
    estimatedMinutes: input.estimatedMinutes,
    actualMinutes: input.actualMinutes ?? null,
    notes: input.notes ?? null,
    source: input.source,
    ...(input.exerciseDetails ? { exerciseDetails: input.exerciseDetails } : {}),
    ...(input.gymClassMeta ? { gymClassMeta: input.gymClassMeta } : {}),
    ...(input.sparringSessionId ? { sparringSessionId: input.sparringSessionId } : {}),
    ...(input.groundBattleMatchId ? { groundBattleMatchId: input.groundBattleMatchId } : {}),
  };
  trainingHistoryRepository.add(entry);
  return entry;
}

export function listTrainingHistory(): TrainingHistoryEntry[] {
  return trainingHistoryRepository.list();
}

export function getTrainingHistoryEntry(id: string): TrainingHistoryEntry | undefined {
  return trainingHistoryRepository.list().find((e) => e.id === id);
}

export function listRecentTrainingHistory(limit = 5): TrainingHistoryEntry[] {
  return listTrainingHistory().slice(0, limit);
}

export function listHistoryForToday(): TrainingHistoryEntry[] {
  const today = todayDateKey();
  return listTrainingHistory().filter((h) => h.date === today);
}

/**
 * "훈련 기록/데이터 삭제" (item 5) — removes one entry locally and queues it
 * for cloud deletion (trainingHistoryRepository.remove's tombstone, flushed
 * by cloudSync/trainingHistorySync.ts before its next pull, exactly like
 * gymRoutine's delete fix — otherwise the surviving Supabase row would get
 * re-pulled and resurrect the "deleted" entry on the next sync). Every
 * volume/calendar/weekly-monthly-stat/recent-list reader re-reads
 * listTrainingHistory() live, so deleting here is immediately reflected
 * everywhere without any separate cache-busting.
 */
export function deleteTrainingHistoryEntry(id: string): void {
  trainingHistoryRepository.remove(id);
}

/** Edits the whole-session note on an already-recorded entry (item 3 — "수정/삭제 가능" from the history detail screen). */
export function updateTrainingHistoryNotes(id: string, notes: string | null): TrainingHistoryEntry | undefined {
  return trainingHistoryRepository.update(id, { notes: notes?.trim() || null });
}

/** Edits one exercise's note within an already-recorded entry. */
export function updateTrainingHistoryExerciseNotes(id: string, techniqueId: string, notes: string | null): TrainingHistoryEntry | undefined {
  const entry = trainingHistoryRepository.get(id);
  if (!entry?.exerciseDetails) return undefined;
  const exerciseDetails = entry.exerciseDetails.map((ex) => (ex.techniqueId === techniqueId ? { ...ex, notes: notes?.trim() || null } : ex));
  return trainingHistoryRepository.update(id, { exerciseDetails });
}

export function getPracticeStatsForTechnique(techniqueId: string): {
  practiceCount: number;
  lastPracticedAt: string | null;
} {
  const entries = listTrainingHistory().filter((h) => h.completed && h.techniqueIds.includes(techniqueId));
  if (entries.length === 0) return { practiceCount: 0, lastPracticedAt: null };
  // entries are stored newest-first (repository.add unshifts)
  return { practiceCount: entries.length, lastPracticedAt: entries[0].completedAt };
}

/**
 * Batch variant for computeAllSkillProgress() — builds a per-technique
 * index from an already-fetched entries array (listTrainingHistory(), read
 * ONCE) in a single pass, instead of every technique independently calling
 * getPracticeStatsForTechnique()/listTrainingHistory() (which re-parses the
 * entire training-history blob from scratch per technique — an N+1 that was
 * the top CPU bottleneck profiled in the packaged app).
 */
export function buildPracticeStatsIndex(
  entries: TrainingHistoryEntry[]
): Map<string, { practiceCount: number; lastPracticedAt: string | null }> {
  const index = new Map<string, { practiceCount: number; lastPracticedAt: string | null }>();
  for (const entry of entries) {
    if (!entry.completed) continue;
    for (const techniqueId of entry.techniqueIds) {
      const existing = index.get(techniqueId);
      if (existing) {
        existing.practiceCount++;
      } else {
        // entries are stored newest-first, so the first entry seen for a
        // technique here is already its most recent completedAt
        index.set(techniqueId, { practiceCount: 1, lastPracticedAt: entry.completedAt });
      }
    }
  }
  return index;
}

export function getPracticeStatsFromIndex(
  techniqueId: string,
  index: Map<string, { practiceCount: number; lastPracticedAt: string | null }>
): { practiceCount: number; lastPracticedAt: string | null } {
  return index.get(techniqueId) ?? { practiceCount: 0, lastPracticedAt: null };
}
