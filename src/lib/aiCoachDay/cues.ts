import type { CueDefinition } from './config';
import type { PracticeRun } from './types';

export interface FiredCue {
  id: string;
  text: string;
}

export function practiceRemainingMs(p: PracticeRun, now = Date.now()): number {
  if (p.paused && p.pausedRemainingMs !== null) return p.pausedRemainingMs;
  return Math.max(0, p.phaseEndTimestamp - now);
}

export function practiceElapsedMs(p: PracticeRun, now = Date.now()): number {
  return Math.max(0, p.totalSeconds * 1000 - practiceRemainingMs(p, now));
}

/**
 * Pure: which cues newly fire for this practice state at `now`. A cue fires
 * only when its condition is met AND it hasn't fired yet (tracked in
 * firedCueIds) — so a 250ms poll can never repeat an announcement, and a
 * cue that is impossible for this length (e.g. "2분 경과" in a 90s run, or
 * "10초 남았어요" in a run that was already under 10s left when resumed)
 * is skipped rather than fired late. `end` fires exactly once at 0.
 */
export function evaluateCues(p: PracticeRun, cues: CueDefinition[], now: number, fill: { name: string; point: string | null }): { fired: FiredCue[]; finished: boolean } {
  const elapsed = practiceElapsedMs(p, now) / 1000;
  const remaining = practiceRemainingMs(p, now) / 1000;
  const total = p.totalSeconds;
  const finished = remaining <= 0;
  const fired: FiredCue[] = [];
  for (const cue of cues) {
    if (p.firedCueIds.includes(cue.id)) continue;
    const t = cue.trigger;
    let due = false;
    if (t.kind === 'elapsed') due = t.seconds < total && elapsed >= t.seconds && remaining > 10;
    else if (t.kind === 'remaining') due = total > t.seconds + 5 && remaining <= t.seconds && remaining > 0;
    else if (t.kind === 'end') due = finished;
    else if (t.kind === 'reminder') due = !!fill.point && elapsed >= total * t.atFraction && remaining > 10;
    if (!due) continue;
    fired.push({ id: cue.id, text: cue.text.replace('{name}', fill.name).replace('{point}', fill.point ?? '') });
  }
  return { fired, finished };
}
