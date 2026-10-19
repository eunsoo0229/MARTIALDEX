import type { CoachMessage } from '../aiCoachDay/types';
import type { LessonContext } from './engine';
import type { CoachLessonState, ConceptStatus } from './types';

// AI 코치 수업 기록 — a SHORT summary of each finished lesson, kept so the
// student can review what was actually taught (전 수업내용 복습) and so later
// lessons/reviews know what was hard. Built only from what happened in the
// lesson: the concepts taught (their explanations come from the lesson's own
// material), the understanding the lesson's grader recorded, the student's
// questions with the coach's answers (trimmed), and the recap. The full
// transcript is NOT kept.
//
// Local first (rides the account backup), synced to coach_lesson_logs
// (own rows only, migration 0038) by cloudSync/jsonRowSync.ts.

export interface LessonLogConcept {
  id: string;
  label: string;
  /** What the coach explained (the lesson's own concept text). */
  explain: string;
  reference: string;
  /** Understanding recorded by the lesson's grader — 'unknown' = never checked. */
  status: ConceptStatus;
  /** The student's own answer that the status is based on, when one was given. */
  evidence?: string;
}

export interface LessonLogTechnique {
  techniqueId: string | null;
  name: string;
  overall: ConceptStatus;
  practiced: boolean;
  concepts: LessonLogConcept[];
}

export interface LessonLogEntry {
  id: string;
  kind: 'curriculum_day' | 'one_off';
  title: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  curriculumId: string | null;
  day: number | null;
  /** The training-history entry the lesson wrote (if any) — the same record, not a copy. */
  historyEntryId: string | null;
  techniques: LessonLogTechnique[];
  /** Student questions with the coach's answer (trimmed, at most QA_LIMIT). */
  qa: { question: string; answer: string }[];
  recap: { question: string; feedback: string } | null;
  updatedAt: string;
  /** Which coach taught it (coachProvider/types.ts). Absent on logs saved before the coach choice — read with coachKindOf() as 'unknown', never assumed. */
  coachKind?: import('../coachProvider/types').StoredCoachKind;
}

const KEY = 'martialdex:coach-lesson-log';
export const LESSON_LOG_EVENT = 'martialdex:coach-lesson-log-updated';
const LIMIT = 200;
const QA_LIMIT = 12;
const ANSWER_CHARS = 400;

function read(): LessonLogEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string' && Array.isArray(e.techniques)) : [];
  } catch {
    return [];
  }
}
function write(list: LessonLogEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // storage full
  }
  window.dispatchEvent(new CustomEvent(LESSON_LOG_EVENT));
}

export function listLessonLog(): LessonLogEntry[] {
  return read().sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
}
export function getLessonLog(id: string): LessonLogEntry | null {
  return read().find((e) => e.id === id) ?? null;
}
export function replaceLessonLog(list: LessonLogEntry[]): void {
  write(list.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)));
}

/** Saves once per lesson id (finishing screens can re-render). */
export function saveLessonLog(e: LessonLogEntry): void {
  const list = read().filter((x) => x.id !== e.id);
  write([e, ...list]);
}

/** Student question → the coach's next answer line, from the lesson transcript. */
export function questionAnswerPairs(messages: CoachMessage[]): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const next = messages.slice(i + 1).find((x) => x.role === 'coach');
    if (next && next.kind === 'answer') out.push({ question: m.text.slice(0, 300), answer: next.text.slice(0, ANSWER_CHARS) });
  }
  return out.slice(-QA_LIMIT);
}

export function techniqueSummary(techniqueId: string | null, name: string, state: CoachLessonState, ctx: LessonContext): LessonLogTechnique {
  return {
    techniqueId,
    name,
    overall: state.understanding.overall,
    practiced: state.practiceDone,
    concepts: ctx.concepts.map((c) => {
      const u = state.understanding.concepts[c.id];
      return { id: c.id, label: c.label, explain: c.explain, reference: c.reference, status: u?.status ?? 'unknown', ...(u?.evidence ? { evidence: u.evidence } : {}) };
    }),
  };
}

/** Concepts any lesson recorded as not understood (weak/partial), newest lesson first. */
export function weakConceptsFromLessons(list: LessonLogEntry[] = read()): { techniqueId: string; name: string; label: string; status: ConceptStatus; lessonId: string; at: string }[] {
  const out: { techniqueId: string; name: string; label: string; status: ConceptStatus; lessonId: string; at: string }[] = [];
  for (const l of list) {
    for (const t of l.techniques) {
      if (!t.techniqueId) continue;
      for (const c of t.concepts) if (c.status === 'weak' || c.status === 'partial') out.push({ techniqueId: t.techniqueId, name: t.name, label: c.label, status: c.status, lessonId: l.id, at: l.finishedAt });
    }
  }
  return out;
}
