import type { CheerLevel, WorkoutPlan } from './workoutPlan';
import { formatDuration } from './workoutPlan';

// 운동 타이머 — work / rest / sets driven ONLY by absolute deadlines
// (Date.now()), the same mechanic as the sparring timer. Nothing is
// accumulated per render or per tick, so re-renders, a throttled background
// tab or a slow device can't make it drift; when the app comes back after
// several phases have passed, `tickWorkout` walks forward deadline by
// deadline (each next phase starts at the previous deadline, not "now").
//
// Coaching cues (응원) are prepared from the plan when the timer starts —
// text only, no AI call — and fire from the same tick: each at most once per
// set and phase, never while paused, and a cue whose moment passed while the
// app was in the background is marked done silently instead of being said
// late. Pure module: no DOM, no storage, no audio.

export type WorkoutPhase = 'work' | 'rest' | 'done';

export interface WorkoutRun {
  plan: Pick<WorkoutPlan, 'exerciseDurationSeconds' | 'sets' | 'restDurationSeconds' | 'title' | 'focus'>;
  phase: WorkoutPhase;
  /** 1-based set being worked (during rest: the set just finished). */
  set: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** Length of the CURRENT phase (a plan edit applies from the next phase, so it can differ from the plan). */
  phaseDurationMs: number;
  paused: boolean;
  pausedRemainingMs: number | null;
  /** Real work time of finished work phases (rest and pauses excluded). */
  workedMs: number;
  completedSets: number;
  /** `${set}:${phase}:${cueId}` — each cue once per set/phase. */
  firedCues: string[];
  startedAt: number;
  finishedAt: number | null;
  endedEarly: boolean;
}

export interface TimerEvent {
  type: 'set_start' | 'rest_start' | 'done' | 'cue';
  /** transition = phase change (always announced unless voice is off); cheer = encouragement (follows the cheer level). */
  kind: 'transition' | 'cheer';
  set: number;
  id: string;
  text: string;
  /** When it was due. */
  at: number;
  /** Due more than STALE_MS ago (app was in the background) — show, don't speak. */
  stale: boolean;
}

export const STALE_MS = 3000;

interface CueDef {
  id: string;
  phase: 'work' | 'rest';
  levels: CheerLevel[];
  /** Seconds after the phase start when it is due; null = not for this length. */
  dueAt: (durationSec: number) => number | null;
  text: (c: { set: number; sets: number; focus: string | null; rest: number }) => string;
}

const ALL: CheerLevel[] = ['minimal', 'normal', 'frequent'];

export const CUES: CueDef[] = [
  { id: 'w_third', phase: 'work', levels: ['frequent'], dueAt: (d) => (d >= 60 ? Math.round(d / 3) : null), text: () => '좋습니다. 지금 리듬을 유지해 보세요.' },
  {
    id: 'w_half',
    phase: 'work',
    levels: ['normal', 'frequent'],
    dueAt: (d) => (d >= 40 ? Math.round(d / 2) : null),
    text: ({ focus }) => (focus ? `절반 지났습니다. ${focus}, 잊지 마세요.` : '절반 지났습니다. 지금 페이스를 유지해 주세요.'),
  },
  { id: 'w_twothird', phase: 'work', levels: ['frequent'], dueAt: (d) => (d >= 90 ? Math.round((d * 2) / 3) : null), text: () => '호흡을 유지하면서 자세를 지켜 주세요.' },
  { id: 'w_last30', phase: 'work', levels: ['normal', 'frequent'], dueAt: (d) => (d >= 75 ? d - 30 : null), text: () => '마지막 30초입니다. 자세를 유지하면서 마무리해 봅시다.' },
  { id: 'w_last10', phase: 'work', levels: ['normal', 'frequent'], dueAt: (d) => (d >= 30 && d < 75 ? d - 10 : null), text: () => '10초 남았습니다. 끝까지 집중해 주세요.' },
  {
    id: 'r_next',
    phase: 'rest',
    levels: ALL,
    dueAt: (d) => (d >= 20 ? d - 10 : null),
    text: ({ set, focus }) => (focus ? `곧 ${set + 1}세트입니다. 다음 세트에서는 ${focus}에 집중해 보세요.` : `곧 ${set + 1}세트입니다. 준비해 주세요.`),
  },
];

function focusFor(run: Pick<WorkoutRun, 'plan'>, set: number): string | null {
  const f = run.plan.focus.filter(Boolean);
  return f.length ? f[(set - 1) % f.length] : null;
}

/** Planned length of a NEW phase of this kind. */
function durMs(run: WorkoutRun, phase: 'work' | 'rest'): number {
  return (phase === 'work' ? run.plan.exerciseDurationSeconds : run.plan.restDurationSeconds) * 1000;
}

export function startWorkout(plan: WorkoutRun['plan'], now: number): { run: WorkoutRun; events: TimerEvent[] } {
  const run: WorkoutRun = {
    plan,
    phase: 'work',
    set: 1,
    phaseStartedAt: now,
    phaseEndsAt: now + plan.exerciseDurationSeconds * 1000,
    phaseDurationMs: plan.exerciseDurationSeconds * 1000,
    paused: false,
    pausedRemainingMs: null,
    workedMs: 0,
    completedSets: 0,
    firedCues: [],
    startedAt: now,
    finishedAt: null,
    endedEarly: false,
  };
  const text = `시작합니다. ${plan.sets > 1 ? `1세트, ` : ''}${formatDuration(plan.exerciseDurationSeconds)} 동안 ${plan.title}${plan.title.endsWith('연습') ? '' : ' 연습'}입니다.`;
  return { run, events: [{ type: 'set_start', kind: 'transition', set: 1, id: '1:work:start', text, at: now, stale: false }] };
}

export function remainingMs(run: WorkoutRun, now: number): number {
  if (run.phase === 'done') return 0;
  if (run.paused && run.pausedRemainingMs !== null) return run.pausedRemainingMs;
  return Math.max(0, run.phaseEndsAt - now);
}

/** Work time actually done so far, including the running work phase. */
export function workedMs(run: WorkoutRun, now: number): number {
  if (run.phase !== 'work') return run.workedMs;
  return run.workedMs + Math.max(0, run.phaseDurationMs - remainingMs(run, now));
}

/**
 * Advances the run to `now`. Returns the new run and what happened (phase
 * changes and cues), in order. Idempotent for the same `now`: calling it
 * twice never advances a set twice or repeats a cue.
 */
export function tickWorkout(prev: WorkoutRun, now: number, cheer: CheerLevel): { run: WorkoutRun; events: TimerEvent[] } {
  if (prev.paused || prev.phase === 'done') return { run: prev, events: [] };
  let run: WorkoutRun = { ...prev, firedCues: [...prev.firedCues] };
  const events: TimerEvent[] = [];
  const stale = (at: number) => now - at > STALE_MS;

  // 1. Phase transitions, chained deadline to deadline (no drift after a background gap).
  for (let guard = 0; run.phase !== 'done' && now >= run.phaseEndsAt && guard < 200; guard++) {
    const at = run.phaseEndsAt;
    if (run.phase === 'work') {
      const completedSets = run.completedSets + 1;
      const worked = run.workedMs + run.phaseDurationMs;
      if (completedSets >= run.plan.sets) {
        run = { ...run, phase: 'done', workedMs: worked, completedSets, finishedAt: at };
        events.push({ type: 'done', kind: 'transition', set: run.set, id: `${run.set}:done`, text: `모든 세트를 마쳤습니다. ${run.plan.sets}세트 수고하셨습니다.`, at, stale: stale(at) });
      } else if (run.plan.restDurationSeconds > 0) {
        run = { ...run, phase: 'rest', workedMs: worked, completedSets, phaseStartedAt: at, phaseEndsAt: at + durMs(run, 'rest'), phaseDurationMs: durMs(run, 'rest') };
        events.push({ type: 'rest_start', kind: 'transition', set: run.set, id: `${run.set}:rest:start`, text: `수고했습니다. ${run.set}세트를 마쳤습니다. 이제 ${formatDuration(run.plan.restDurationSeconds)} 휴식입니다.`, at, stale: stale(at) });
      } else {
        run = { ...run, phase: 'work', set: run.set + 1, workedMs: worked, completedSets, phaseStartedAt: at, phaseEndsAt: at + durMs(run, 'work'), phaseDurationMs: durMs(run, 'work') };
        events.push({ type: 'set_start', kind: 'transition', set: run.set, id: `${run.set}:work:start`, text: `${run.set}세트 시작합니다.`, at, stale: stale(at) });
      }
    } else {
      run = { ...run, phase: 'work', set: run.set + 1, phaseStartedAt: at, phaseEndsAt: at + durMs(run, 'work'), phaseDurationMs: durMs(run, 'work') };
      events.push({ type: 'set_start', kind: 'transition', set: run.set, id: `${run.set}:work:start`, text: `${run.set}세트 시작합니다.${run.set === run.plan.sets ? ' 마지막 세트입니다.' : ''}`, at, stale: stale(at) });
    }
  }

  // 2. Cues of the current phase.
  if (run.phase !== 'done' && cheer !== 'off') {
    const phase = run.phase;
    const dSec = run.phaseDurationMs / 1000;
    for (const cue of CUES) {
      if (cue.phase !== phase || !cue.levels.includes(cheer)) continue;
      const due = cue.dueAt(dSec);
      if (due === null) continue;
      const key = `${run.set}:${phase}:${cue.id}`;
      if (run.firedCues.includes(key)) continue;
      const at = run.phaseStartedAt + due * 1000;
      if (now < at) continue;
      run.firedCues.push(key);
      events.push({ type: 'cue', kind: 'cheer', set: run.set, id: key, text: cue.text({ set: run.set, sets: run.plan.sets, focus: focusFor(run, phase === 'rest' ? run.set + 1 : run.set), rest: run.plan.restDurationSeconds }), at, stale: stale(at) });
    }
  }
  return { run, events };
}

export function pauseWorkout(run: WorkoutRun, now: number): WorkoutRun {
  if (run.paused || run.phase === 'done') return run;
  return { ...run, paused: true, pausedRemainingMs: Math.max(0, run.phaseEndsAt - now) };
}

/** Resumes; the phase's start shifts by the pause so cue moments stay relative to real work time. */
export function resumeWorkout(run: WorkoutRun, now: number): WorkoutRun {
  if (!run.paused || run.phase === 'done') return run;
  const remaining = run.pausedRemainingMs ?? 0;
  const phaseEndsAt = now + remaining;
  return { ...run, paused: false, pausedRemainingMs: null, phaseEndsAt, phaseStartedAt: phaseEndsAt - run.phaseDurationMs };
}

/** Ends now (never traps the student); the real work time so far is kept. */
export function stopWorkout(run: WorkoutRun, now: number): WorkoutRun {
  if (run.phase === 'done') return run;
  return { ...run, workedMs: workedMs(run, now), phase: 'done', paused: false, pausedRemainingMs: null, finishedAt: now, endedEarly: true };
}

/**
 * Applies an edited plan to a running timer: the set count takes effect at
 * once (never below the set in progress); new work/rest lengths apply from
 * the NEXT phase, so the running countdown doesn't jump.
 */
export function changeRunPlan(run: WorkoutRun, plan: WorkoutRun['plan']): WorkoutRun {
  if (run.phase === 'done') return run;
  return { ...run, plan: { ...plan, sets: Math.max(plan.sets, run.set) } };
}

export interface WorkoutResult {
  completedSets: number;
  plannedSets: number;
  workedSeconds: number;
  endedEarly: boolean;
}

export function workoutResult(run: WorkoutRun, now: number): WorkoutResult {
  return { completedSets: run.completedSets, plannedSets: run.plan.sets, workedSeconds: Math.round(workedMs(run, now) / 1000), endedEarly: run.endedEarly };
}
