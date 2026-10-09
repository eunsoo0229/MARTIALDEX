import { PRACTICE_CUES } from './config';
import { evaluateCues, practiceElapsedMs, practiceRemainingMs } from './cues';
import type { CoachDayRun, CoachMessage, CoachMode, CoachStep } from './types';

const KEY = 'martialdex:ai-coach-day-run';
export const COACH_DAY_EVENT = 'martialdex:ai-coach-day-updated';

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Same defensive shape check as sparringSession/matchStore — a malformed or
// older-schema entry is treated as "no session" and cleared, never crashes.
function isValidRun(v: unknown): v is CoachDayRun {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.curriculumId === 'string' &&
    typeof o.day === 'number' &&
    (o.mode === 'voice' || o.mode === 'text') &&
    Array.isArray(o.techniqueIds) &&
    typeof o.index === 'number' &&
    typeof o.step === 'string' &&
    Array.isArray(o.messages) &&
    !!o.outcomes &&
    typeof o.outcomes === 'object'
  );
}

export function getCoachDayRun(): CoachDayRun | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidRun(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function write(run: CoachDayRun | null) {
  if (run) window.localStorage.setItem(KEY, JSON.stringify(run));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(COACH_DAY_EVENT));
}

export function clearCoachDayRun(): void {
  write(null);
}

export function startCoachDayRun(
  curriculumId: string,
  day: number,
  mode: CoachMode,
  techniqueIds: string[],
  location: CoachDayRun['location'] = null,
  equipment: string[] = []
): CoachDayRun {
  const run: CoachDayRun = {
    id: newId(),
    curriculumId,
    day,
    mode,
    techniqueIds,
    index: 0,
    step: 'explain',
    messages: [],
    practice: null,
    outcomes: Object.fromEntries(techniqueIds.map((id) => [id, { practicedSeconds: 0, completed: false, quiz: null }])),
    pendingQuiz: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    historyEntryId: null,
    location,
    equipment,
  };
  write(run);
  return run;
}

export function updateCoachDayRun(mutate: (run: CoachDayRun) => CoachDayRun): CoachDayRun | null {
  const run = getCoachDayRun();
  if (!run) return null;
  const next = mutate(run);
  write(next);
  return next;
}

export function appendMessages(messages: Omit<CoachMessage, 'id' | 'at'>[]): CoachDayRun | null {
  const at = new Date().toISOString();
  return updateCoachDayRun((r) => ({ ...r, messages: [...r.messages, ...messages.map((m) => ({ ...m, id: newId(), at }))] }));
}

export function setStep(step: CoachStep): CoachDayRun | null {
  return updateCoachDayRun((r) => ({ ...r, step }));
}

export function startPractice(totalSeconds: number): CoachDayRun | null {
  return updateCoachDayRun((r) => {
    const techniqueId = r.techniqueIds[r.index];
    return {
      ...r,
      step: 'practice',
      practice: { techniqueId, totalSeconds, startedAt: new Date().toISOString(), phaseEndTimestamp: Date.now() + totalSeconds * 1000, pausedRemainingMs: null, paused: false, firedCueIds: [] },
    };
  });
}

export function pausePractice(): CoachDayRun | null {
  return updateCoachDayRun((r) => (r.practice && !r.practice.paused ? { ...r, practice: { ...r.practice, paused: true, pausedRemainingMs: practiceRemainingMs(r.practice) } } : r));
}

export function resumePractice(): CoachDayRun | null {
  return updateCoachDayRun((r) =>
    r.practice && r.practice.paused ? { ...r, practice: { ...r.practice, paused: false, phaseEndTimestamp: Date.now() + (r.practice.pausedRemainingMs ?? 0), pausedRemainingMs: null } } : r
  );
}

/** Ends the current practice early (never traps the user) — records the real elapsed time, not the planned length. */
export function stopPracticeEarly(): CoachDayRun | null {
  return updateCoachDayRun((r) => {
    if (!r.practice) return r;
    const practiced = Math.round(practiceElapsedMs(r.practice) / 1000);
    return {
      ...r,
      step: 'practiced',
      outcomes: { ...r.outcomes, [r.practice.techniqueId]: { ...r.outcomes[r.practice.techniqueId], practicedSeconds: practiced, completed: false } },
      practice: null,
    };
  });
}

/**
 * Polled by the UI. Fires due cues exactly once (appending them to the
 * transcript) and completes the practice at 0. Returns the newly-fired cue
 * messages so the caller can speak them — only the new ones, never replays.
 */
export function tickPractice(fill: { name: string; point: string | null }): CoachMessage[] {
  const run = getCoachDayRun();
  if (!run || run.step !== 'practice' || !run.practice || run.practice.paused) return [];
  const now = Date.now();
  const { fired, finished } = evaluateCues(run.practice, PRACTICE_CUES, now, fill);
  if (fired.length === 0 && !finished) return [];
  const at = new Date().toISOString();
  const msgs: CoachMessage[] = fired.map((c) => ({ id: newId(), role: 'coach', text: c.text, kind: 'cue', at }));
  const practice = { ...run.practice, firedCueIds: [...run.practice.firedCueIds, ...fired.map((c) => c.id)] };
  let next: CoachDayRun = { ...run, practice, messages: [...run.messages, ...msgs] };
  if (finished) {
    next = {
      ...next,
      step: 'practiced',
      practice: null,
      outcomes: { ...next.outcomes, [practice.techniqueId]: { ...next.outcomes[practice.techniqueId], practicedSeconds: practice.totalSeconds, completed: true } },
    };
  }
  write(next);
  return msgs;
}
