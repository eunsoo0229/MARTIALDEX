import type { TechniqueLearningRecord } from './types';

// Per-technique learning record from AI 코치 수업: which concepts were
// understood / partly understood / not yet, what the student asked, and what
// needs review. Stored under the shared `martialdex:` prefix, so it is part
// of the existing data backup. A later curriculum (or the next lesson on the
// same technique) reads it to review exactly the weak concepts.

const KEY = 'martialdex:coach-lesson-records';

function readAll(): Record<string, TechniqueLearningRecord> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getLearningRecord(techniqueId: string): TechniqueLearningRecord | null {
  const r = readAll()[techniqueId];
  return r && Array.isArray(r.concepts) ? r : null;
}

export function listLearningRecords(): TechniqueLearningRecord[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Saves a record; questions asked in earlier lessons are kept (deduped, last 20). */
export function saveLearningRecord(record: TechniqueLearningRecord): void {
  try {
    const all = readAll();
    const prev = all[record.techniqueId];
    all[record.techniqueId] = { ...record, questions: [...new Set([...(prev?.questions ?? []), ...record.questions])].slice(-20) };
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full / unavailable — the lesson itself still works.
  }
}

/** Technique ids whose last lesson left a concept not understood (for curriculum review). */
export function techniquesNeedingReview(): string[] {
  return listLearningRecords()
    .filter((r) => r.needsReview.length > 0)
    .map((r) => r.techniqueId);
}
