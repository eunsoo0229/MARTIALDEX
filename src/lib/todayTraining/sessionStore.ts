import type { TodaySessionState, TodayTrainingPlan } from './types';
import type { Curriculum } from '../curriculum/types';
import { todayDateKey } from '../dateUtil';
import { deleteTrainingHistoryEntry, recordTrainingSession } from '../trainingHistory/service';
import { ensureProgress, getProgress, setDayComplete } from '../curriculum/curriculumService';
import { buildExerciseHistoryDetails } from './sessionDetail';
import { buildTrainingPlanForCurriculumDay } from './planner';

const KEY = 'martialdex:today-training-session';

export function readSession(): TodaySessionState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TodaySessionState) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: TodaySessionState | null) {
  if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('martialdex:today-training-updated'));
}

// A new calendar day always means a fresh plan — yesterday's half-finished
// ad-hoc session (or a curriculum Day that's since been completed elsewhere)
// never lingers into today's view.
export function getTodaySession(): TodaySessionState | null {
  const session = readSession();
  if (!session || session.date !== todayDateKey()) return null;
  return session;
}

export function startTodaySession(plan: TodayTrainingPlan): TodaySessionState {
  const session: TodaySessionState = {
    date: todayDateKey(),
    plan,
    completedTechniqueIds: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  writeSession(session);
  return session;
}

export function markTechniqueComplete(techniqueId: string): TodaySessionState | null {
  const session = getTodaySession();
  if (!session) return null;
  if (!session.completedTechniqueIds.includes(techniqueId)) {
    session.completedTechniqueIds = [...session.completedTechniqueIds, techniqueId];
  }
  writeSession(session);
  return session;
}

export function isSessionFullyComplete(session: TodaySessionState): boolean {
  return session.plan.techniqueIds.length > 0 && session.plan.techniqueIds.every((id) => session.completedTechniqueIds.includes(id));
}

/** Sets (or clears) the whole-session note — carried into TrainingHistoryEntry.notes at finalize. Distinct from each exercise's own note (sessionDetail.ts's setExerciseNote). */
export function setSessionNotes(session: TodaySessionState, notes: string | null): TodaySessionState {
  const updated: TodaySessionState = { ...session, sessionNotes: notes?.trim() || null };
  writeSession(updated);
  return updated;
}

export interface FinalizeResult {
  entryId: string;
  /** Whether this curriculum Day was ALREADY marked complete before this finalize — lets undoTodaySessionFinalize know whether reverting should un-complete it or leave it alone (it might have been completed independently, e.g. from the Day-detail page). */
  dayWasAlreadyComplete: boolean;
}

// 13-6 훈련 기록: writes one entry into the existing trainingHistory log, and
// — only for a curriculum-backed session — marks that Day complete through
// the SAME curriculumService functions the existing Day-detail page uses, so
// curriculum progress stays perfectly in sync rather than duplicating it.
export function finalizeTodaySession(
  session: TodaySessionState,
  options?: { curriculum?: Curriculum; actualMinutes?: number }
): FinalizeResult {
  // Idempotency guard — see TodaySessionState.finalizedEntryId's doc
  // comment. Re-reads the PERSISTED session rather than trusting the
  // `session` argument: React StrictMode's deliberate double-invocation of
  // an effect calls this function twice with the SAME closed-over (stale)
  // session object, so checking that argument alone would let both calls
  // see `finishedAt: null` and both proceed. The first call's `writeSession`
  // below completes synchronously before the second call starts, so by the
  // time the second one runs, a fresh read reflects the first call's result.
  const persisted = readSession();
  if (persisted && persisted.date === session.date && persisted.finishedAt && persisted.finalizedEntryId) {
    return { entryId: persisted.finalizedEntryId, dayWasAlreadyComplete: true };
  }

  const entry = recordTrainingSession({
    curriculumId: session.plan.curriculumId,
    dayNumber: session.plan.day,
    techniqueIds: session.plan.techniqueIds,
    completed: true,
    estimatedMinutes: session.plan.estimatedMinutes,
    actualMinutes: options?.actualMinutes ?? null,
    notes: session.sessionNotes ?? null,
    source: session.plan.mode === 'curriculum' ? 'curriculum' : 'coach_today',
    exerciseDetails: session.detail ? buildExerciseHistoryDetails(session.detail) : undefined,
  });

  let dayWasAlreadyComplete = false;
  if (options?.curriculum && session.plan.day !== null) {
    ensureProgress(options.curriculum);
    dayWasAlreadyComplete = getProgress(options.curriculum.id)?.completedDays.includes(session.plan.day) ?? false;
    setDayComplete(options.curriculum, session.plan.day, true);
  }

  writeSession({
    ...session,
    finishedAt: new Date().toISOString(),
    finalizedEntryId: entry.id,
    finalizeDayWasAlreadyComplete: dayWasAlreadyComplete,
  });
  return { entryId: entry.id, dayWasAlreadyComplete };
}

/**
 * "방금 한 훈련 취소" (item 6) — only meaningful for an already-finalized
 * session (`session.finalizedEntryId` set). Reads the entry id and
 * pre-finalize curriculum state straight off the PERSISTED session (set by
 * finalizeTodaySession above) rather than requiring the caller to have held
 * onto the FinalizeResult in component state — that would have made
 * "훈련 취소" disappear the instant the page unmounted and remounted (e.g.
 * the user checked 훈련 기록 first, then came back to cancel), since plain
 * React state doesn't survive a remount but the session in localStorage
 * does. Cancelling means "this training never happened": deletes the
 * just-created trainingHistory entry (which every volume/calendar/weekly-
 * monthly-stat/recent-list reader derives from — see gymTraining/volume.ts,
 * trainingAnalytics/calendarData.ts, statsHub/*, all of which re-read
 * listTrainingHistory() live, so removing the entry automatically removes
 * it from every one of those), un-completes the curriculum Day ONLY if this
 * finalize was the one that first completed it (never un-completes a Day
 * that was already done before), and clears the whole session outright
 * rather than trying to surgically restore `finishedAt: null` — that would
 * race TodayTraining.tsx's own auto-finish effect (which re-finalizes the
 * instant it sees `isFullyComplete && !finishedAt`), since
 * forceFinishTodaySession's "전체 완료" already marked every technique
 * complete. A cleared session is simply regenerated fresh (exactly like a
 * normal not-yet-started day) the next time "오늘의 훈련" is opened.
 */
export function undoTodaySessionFinalize(session: TodaySessionState, curriculum?: Curriculum): void {
  if (!session.finalizedEntryId) return;
  deleteTrainingHistoryEntry(session.finalizedEntryId);
  if (curriculum && session.plan.day != null && !session.finalizeDayWasAlreadyComplete) {
    setDayComplete(curriculum, session.plan.day, false);
  }
  clearTodaySession();
}

/**
 * "오늘 훈련 전체 완료" — lets the user end today's session without
 * finishing every exercise one at a time. Marks every technique in the plan
 * complete (so `isSessionFullyComplete` holds) and finalizes in the SAME
 * write as `finalizeTodaySession` below, so there is no intermediate render
 * where `isFullyComplete && !finishedAt` — TodayTraining.tsx's own
 * auto-finish effect (which watches for exactly that) would otherwise race
 * this and finalize the session a second time.
 *
 * Never invents set data: any set never recorded via recordSetResult stays
 * `{ completed: false, actualReps: null, actualSeconds: null, ... }` exactly
 * as sessionDetail.ts already defaults it, and buildExerciseHistoryDetails
 * persists those nulls as-is into trainingHistory — this only changes the
 * SESSION's completion status, never fabricates a weight/rep/duration the
 * user never actually performed.
 */
export function forceFinishTodaySession(session: TodaySessionState, options?: { curriculum?: Curriculum; actualMinutes?: number }) {
  const withAllComplete: TodaySessionState = {
    ...session,
    completedTechniqueIds: Array.from(new Set([...session.completedTechniqueIds, ...session.plan.techniqueIds])),
  };
  return finalizeTodaySession(withAllComplete, options);
}

export function clearTodaySession(): void {
  writeSession(null);
}

// Unified "훈련하기" entry point (CurriculumDayList's day-select screen) —
// works identically for official, custom, and AI 선수 스타일 curricula since
// they're all the same Curriculum/CurriculumDay shape; no source-specific
// branching. Overwrites whatever session is currently stored for today (the
// caller is expected to confirm with the user first if that would discard
// unfinished progress on a different curriculum/day — see
// CurriculumTrainingStart.tsx).
export function startCurriculumDayTraining(curriculum: Curriculum, day: number): TodaySessionState | null {
  const plan = buildTrainingPlanForCurriculumDay(curriculum, day);
  if (!plan) return null;
  ensureProgress(curriculum);
  return startTodaySession(plan);
}

// 15단계 stage 16: lets the sparring-analysis result screen add a specific
// real technique into today's plan (e.g. from a coach-connected weak area) —
// starts a session from the current preview plan if the user hasn't hit
// [훈련 시작] yet today, otherwise just appends to the already-running one.
// Never adds to an already-finished session (day semantics are done then).
export function addTechniqueToSession(techniqueId: string, fallbackPlan: TodayTrainingPlan): TodaySessionState {
  const existing = getTodaySession();
  const session = existing && !existing.finishedAt ? existing : startTodaySession(fallbackPlan);
  if (session.plan.techniqueIds.includes(techniqueId)) return session;
  const updated: TodaySessionState = { ...session, plan: { ...session.plan, techniqueIds: [...session.plan.techniqueIds, techniqueId] } };
  writeSession(updated);
  return updated;
}
