import type { SparringPhase, SparringRules, SparringRunState } from './types';

// One active sparring run at a time, independent of every other training
// mode's own session key (freeTraining/shadowBoxing/combo all follow this
// same "own key, can't clobber each other" convention).
const KEY = 'martialdex:sparring-run';
const EVENT = 'martialdex:sparring-run-updated';

// Runtime shape check on top of JSON.parse's own try/catch — JSON.parse
// happily returns a syntactically-valid object that doesn't match
// SparringRunState (e.g. a legacy/partial write from an interrupted save,
// or a future schema change). Without this, SparringSession.tsx's render
// reaches `run.rules.plannedRounds` on an undefined `rules` and throws —
// confirmed live to blank the ENTIRE app (spec "Free Training -> Sparring
// 검은 화면" root cause), since nothing in the tree used to catch it. A
// malformed entry is treated the same as "no run" (falls back to the setup
// screen) and cleared so it can't keep tripping this on every future visit.
function isValidRunState(v: unknown): v is SparringRunState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const rules = o.rules as Record<string, unknown> | undefined;
  return (
    !!rules &&
    typeof rules === 'object' &&
    typeof rules.plannedRounds === 'number' &&
    typeof rules.roundDurationSeconds === 'number' &&
    typeof rules.restDurationSeconds === 'number' &&
    typeof o.currentRound === 'number' &&
    (o.phase === 'round' || o.phase === 'rest' || o.phase === 'finished') &&
    typeof o.phaseEndTimestamp === 'number' &&
    typeof o.paused === 'boolean' &&
    typeof o.accumulatedRoundMs === 'number' &&
    typeof o.completedRounds === 'number'
  );
}

function readRun(): SparringRunState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidRunState(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRun(run: SparringRunState | null) {
  if (run) window.localStorage.setItem(KEY, JSON.stringify(run));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getSparringRun(): SparringRunState | null {
  return readRun();
}

export function startSparringRun(rules: SparringRules): SparringRunState {
  const now = Date.now();
  const run: SparringRunState = {
    rules,
    currentRound: 1,
    phase: 'round',
    phaseEndTimestamp: now + rules.roundDurationSeconds * 1000,
    pausedRemainingMs: null,
    paused: false,
    accumulatedRoundMs: 0,
    completedRounds: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  writeRun(run);
  return run;
}

/** Real elapsed time actually SPARRING (round phases only — rest/pauses excluded), per spec section 8's "예정과 실제를 분리, rounds×roundDuration으로 계산하지 않는다". Includes the current in-progress round phase's elapsed time when still running. */
export function getActualSparringMs(run: SparringRunState): number {
  if (run.phase !== 'round') return run.accumulatedRoundMs;
  const elapsedInCurrentRound = run.paused
    ? run.rules.roundDurationSeconds * 1000 - (run.pausedRemainingMs ?? 0)
    : Math.max(0, run.rules.roundDurationSeconds * 1000 - Math.max(0, run.phaseEndTimestamp - Date.now()));
  return run.accumulatedRoundMs + elapsedInCurrentRound;
}

export function getPhaseRemainingMs(run: SparringRunState): number {
  if (run.pausedRemainingMs !== null) return run.pausedRemainingMs;
  return Math.max(0, run.phaseEndTimestamp - Date.now());
}

function phaseDurationSeconds(rules: SparringRules, phase: SparringPhase): number {
  return phase === 'round' ? rules.roundDurationSeconds : rules.restDurationSeconds;
}

/** Polled every ~250ms by the UI hook — advances round<->rest<->finished on real elapsed time, never drifts (Date.now()-based absolute deadlines, same mechanic as shadowBoxing/sessionStore.ts). */
export function tickSparringRun(): SparringRunState | null {
  let run = readRun();
  if (!run || run.paused || run.phase === 'finished') return run;
  const now = Date.now();
  if (now < run.phaseEndTimestamp) return run;

  if (run.phase === 'round') {
    const roundMs = run.rules.roundDurationSeconds * 1000;
    const completedRounds = run.completedRounds + 1;
    if (completedRounds >= run.rules.plannedRounds) {
      run = { ...run, phase: 'finished', accumulatedRoundMs: run.accumulatedRoundMs + roundMs, completedRounds, finishedAt: new Date().toISOString() };
    } else if (run.rules.restDurationSeconds > 0) {
      run = { ...run, phase: 'rest', accumulatedRoundMs: run.accumulatedRoundMs + roundMs, completedRounds, phaseEndTimestamp: now + run.rules.restDurationSeconds * 1000 };
    } else {
      run = { ...run, phase: 'round', accumulatedRoundMs: run.accumulatedRoundMs + roundMs, completedRounds, currentRound: run.currentRound + 1, phaseEndTimestamp: now + roundMs };
    }
  } else if (run.phase === 'rest') {
    run = { ...run, phase: 'round', currentRound: run.currentRound + 1, phaseEndTimestamp: now + run.rules.roundDurationSeconds * 1000 };
  }
  writeRun(run);
  return run;
}

export function pauseSparringRun(): SparringRunState | null {
  const run = readRun();
  if (!run || run.paused || run.phase === 'finished') return run;
  const updated: SparringRunState = { ...run, paused: true, pausedRemainingMs: getPhaseRemainingMs(run) };
  writeRun(updated);
  return updated;
}

export function resumeSparringRun(): SparringRunState | null {
  const run = readRun();
  if (!run || !run.paused) return run;
  const now = Date.now();
  const updated: SparringRunState = { ...run, paused: false, phaseEndTimestamp: now + (run.pausedRemainingMs ?? 0), pausedRemainingMs: null };
  writeRun(updated);
  return updated;
}

/** Manual early end (spec section 9's "취소"/조기 종료 — never traps the user). Freezes the real elapsed round-time accumulated so far into accumulatedRoundMs and marks finished; the caller (end screen) reads getActualSparringMs() for display/edit before saving. */
export function endSparringRunNow(): SparringRunState | null {
  const run = readRun();
  if (!run || run.phase === 'finished') return run;
  const actualMs = getActualSparringMs(run);
  const updated: SparringRunState = {
    ...run,
    phase: 'finished',
    accumulatedRoundMs: actualMs,
    paused: false,
    pausedRemainingMs: null,
    finishedAt: new Date().toISOString(),
  };
  writeRun(updated);
  return updated;
}

export function clearSparringRun(): void {
  writeRun(null);
}
