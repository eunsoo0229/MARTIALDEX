import type { ConceptStatus } from '../coachLesson/types';

// 복습 기록 — what was reviewed, from which mode, and how the understanding
// checks went. Deliberately SEPARATE from training history: reviewing a past
// training is not doing that training again, so nothing here writes a
// training_history entry or counts as practice.
//
// Local first (key below, rides the account backup), and synced to the
// review_logs table (own rows only — migration 0038) by
// cloudSync/jsonRowSync.ts.

export type ReviewMode = 'training' | 'lesson' | 'gym' | 'weak' | 'ai';

export const REVIEW_MODE_LABEL: Record<ReviewMode, string> = {
  training: '전 훈련 복습',
  lesson: '전 수업내용(AI 코치) 복습',
  gym: '전 체육관 훈련 복습',
  weak: '부족 기술 보완 복습',
  ai: 'AI 추천 복습',
};

export interface ReviewCheckResult {
  techniqueId: string;
  /** The concept the question was about (coach-lesson concept id or 'kp-0' …), when known. */
  conceptId: string | null;
  conceptLabel: string | null;
  question: string;
  answer: string;
  verdict: ConceptStatus;
  /** What was missing, per the grader. */
  missing: string[];
  /** 'ai' = graded by meaning; 'keyword' = offline fallback. */
  method: 'ai' | 'keyword' | 'self';
}

export interface ReviewLogEntry {
  id: string;
  mode: ReviewMode;
  /** What was reviewed: a training-history entry id, a lesson-log id, or null (technique list). */
  sourceRef: string | null;
  techniqueIds: string[];
  /** Techniques the student finished going through. */
  completedTechniqueIds: string[];
  /** Techniques the student marked "아직 어려워요". */
  difficultTechniqueIds: string[];
  results: ReviewCheckResult[];
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

const KEY = 'martialdex:review-log';
export const REVIEW_LOG_EVENT = 'martialdex:review-log-updated';
const LIMIT = 300;

function read(): ReviewLogEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string' && Array.isArray(e.techniqueIds)) : [];
  } catch {
    return [];
  }
}
function write(list: ReviewLogEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // storage full — the review itself still worked
  }
  window.dispatchEvent(new CustomEvent(REVIEW_LOG_EVENT));
}

export function listReviewLog(): ReviewLogEntry[] {
  return read().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Replaces the whole log (cloud sync merge). */
export function replaceReviewLog(list: ReviewLogEntry[]): void {
  write(list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
}

const newId = () => `rv_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`;

export function startReviewLog(mode: ReviewMode, sourceRef: string | null, techniqueIds: string[]): ReviewLogEntry {
  const now = new Date().toISOString();
  const e: ReviewLogEntry = { id: newId(), mode, sourceRef, techniqueIds: [...new Set(techniqueIds)], completedTechniqueIds: [], difficultTechniqueIds: [], results: [], startedAt: now, finishedAt: null, updatedAt: now };
  write([e, ...read()]);
  return e;
}

export function updateReviewLog(id: string, fn: (e: ReviewLogEntry) => ReviewLogEntry): ReviewLogEntry | null {
  const list = read();
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  list[i] = { ...fn(list[i]), updatedAt: new Date().toISOString() };
  write(list);
  return list[i];
}

export function getReviewLog(id: string): ReviewLogEntry | null {
  return read().find((e) => e.id === id) ?? null;
}

/** Last time each technique was actually gone through in a review (finished or not). */
export function lastReviewedAtIndex(list: ReviewLogEntry[] = read()): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of list) {
    const at = e.finishedAt ?? e.updatedAt;
    for (const id of e.completedTechniqueIds) if (!m.has(id) || m.get(id)! < at) m.set(id, at);
  }
  return m;
}

/** Every understanding-check result, newest first, with when it happened. */
export function allCheckResults(list: ReviewLogEntry[] = read()): (ReviewCheckResult & { at: string; mode: ReviewMode; logId: string })[] {
  return list
    .flatMap((e) => e.results.map((r) => ({ ...r, at: e.updatedAt, mode: e.mode, logId: e.id })))
    .sort((a, b) => b.at.localeCompare(a.at));
}
