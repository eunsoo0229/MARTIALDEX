import type { LiveSession } from './types';

// Pure timeline math shared by coach and student devices — the same inputs
// (the authoritative session row + the server clock) always produce the
// same set / phase / remaining time on every device. Nothing here ticks or
// counts down: a display just calls viewAt(session, serverNow()) as often as
// it likes, so a backgrounded phone or a dropped connection can never make
// the timer drift — it is recomputed from the anchor every time.

export type LivePhase = 'ready' | 'work' | 'rest' | 'paused' | 'done';

export interface LiveView {
  status: LiveSession['status'];
  /** What to show: 'paused' while paused (underlyingPhase says WORK/REST). */
  phase: LivePhase;
  underlyingPhase: 'work' | 'rest' | null;
  /** 0-based current set/round (clamped to the last one). */
  setIndex: number;
  totalSets: number;
  remainingMs: number;
  phaseDurationMs: number;
  elapsedMs: number;
  totalMs: number;
  /** What comes after the current phase. */
  next: { phase: 'work' | 'rest' | 'done'; durationMs: number };
}

export function totalMsOf(s: Pick<LiveSession, 'workSeconds' | 'restSeconds' | 'totalSets'>): number {
  return (s.totalSets * s.workSeconds + (s.totalSets - 1) * s.restSeconds) * 1000;
}

/** Timeline time (pauses excluded) at a given server instant — the same formula as SQL gym_live_elapsed_ms. */
export function elapsedAt(s: LiveSession, serverNowMs: number): number {
  const total = totalMsOf(s);
  if (s.status === 'completed' || s.status === 'interrupted' || s.status === 'cancelled') return Math.min(total, s.endedElapsedMs ?? s.anchorElapsedMs);
  const raw = s.status === 'running' && s.anchorAt != null ? s.anchorElapsedMs + (serverNowMs - s.anchorAt) : s.anchorElapsedMs;
  return Math.max(0, Math.min(total, raw));
}

export function viewAt(s: LiveSession, serverNowMs: number): LiveView {
  const work = s.workSeconds * 1000;
  const rest = s.restSeconds * 1000;
  const cycle = work + rest;
  const totalMs = totalMsOf(s);
  const elapsedMs = elapsedAt(s, serverNowMs);
  const setIndex = Math.min(Math.floor(elapsedMs / cycle), s.totalSets - 1);
  const within = elapsedMs - setIndex * cycle;
  const isLast = setIndex === s.totalSets - 1;
  const inWork = within < work || (isLast && within >= work);
  const underlying: 'work' | 'rest' = inWork ? 'work' : 'rest';
  const phaseDurationMs = inWork ? work : rest;
  const remainingMs = Math.max(0, inWork ? work - within : cycle - within);
  const next: LiveView['next'] = inWork ? (isLast ? { phase: 'done', durationMs: 0 } : rest > 0 ? { phase: 'rest', durationMs: rest } : { phase: 'work', durationMs: work }) : { phase: 'work', durationMs: work };

  let phase: LivePhase;
  if (s.status === 'ready') phase = 'ready';
  else if (s.status === 'paused') phase = 'paused';
  else if (s.status !== 'running' || elapsedMs >= totalMs) phase = 'done';
  else phase = underlying;

  return {
    status: s.status,
    phase,
    underlyingPhase: s.status === 'ready' ? null : underlying,
    setIndex: s.status === 'ready' ? 0 : setIndex,
    totalSets: s.totalSets,
    remainingMs: s.status === 'ready' ? work : phase === 'done' ? 0 : remainingMs,
    phaseDurationMs: s.status === 'ready' ? work : phaseDurationMs,
    elapsedMs,
    totalMs,
    next,
  };
}

/** Lived timeline intervals, including the still-open one while running. */
function livedSegments(s: LiveSession, serverNowMs: number): [number, number][] {
  const segs = s.segments.map(([a, b]) => [a, b] as [number, number]);
  if (s.status === 'running' && s.anchorAt != null) segs.push([s.anchorElapsedMs, elapsedAt(s, serverNowMs)]);
  return segs;
}

/**
 * Seconds actually spent in each set's WORK window, from the lived
 * intervals — a set the coach skipped mid-way or ended early only gets the
 * time really spent in it.
 */
export function workSecondsPerSet(s: LiveSession, serverNowMs: number): number[] {
  const work = s.workSeconds * 1000;
  const cycle = (s.workSeconds + s.restSeconds) * 1000;
  const segs = livedSegments(s, serverNowMs);
  return Array.from({ length: s.totalSets }, (_, k) => {
    const from = k * cycle;
    const to = from + work;
    let lived = 0;
    for (const [a, b] of segs) lived += Math.max(0, Math.min(b, to) - Math.max(a, from));
    return Math.round(lived / 100) / 10;
  });
}

/** A set counts as completed only when (almost) its whole WORK window was lived — 0.5s tolerance for clock rounding. */
export function completedSetFlags(s: LiveSession, serverNowMs: number): boolean[] {
  return workSecondsPerSet(s, serverNowMs).map((sec) => sec >= s.workSeconds - 0.5);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
