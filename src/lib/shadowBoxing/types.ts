// "AI Shadow Boxing Coach" (25단계) — a hands-free, TTS-guided round timer.
// Deliberately its OWN session shape (not todayTraining's per-exercise sets
// model, not combo's round-of-a-fixed-sequence model): a round here is a
// fixed-duration timer during which real techniques are called out on a
// pace, not a discrete set the user marks complete by hand — see
// sessionStore.ts's header comment for why. Still writes its result into
// the EXISTING trainingHistory log on finish (spec section 5), same as
// every other training mode.

export type ShadowPace = 'slow' | 'normal' | 'fast';
export const PACE_SECONDS: Record<ShadowPace, number> = { slow: 8, normal: 5, fast: 3 };
export const PACE_LABEL: Record<ShadowPace, string> = { slow: '느림', normal: '보통', fast: '빠름' };

export type ShadowPhase = 'round' | 'rest' | 'finished';

export interface ShadowSessionState {
  martialArt: string;
  /** Ordered pool of real technique ids this session announces from (round-robin) — never invented, see techniquePool.ts. */
  techniquePool: string[];
  roundSeconds: number;
  totalRounds: number;
  restSeconds: number;
  pace: ShadowPace;
  paceSeconds: number;
  currentRound: number;
  phase: ShadowPhase;
  /** Date.now()-based absolute deadline for the current round/rest phase. */
  phaseEndTimestamp: number;
  /** Non-null only while paused: the phase's frozen remaining ms. */
  pausedRemainingMs: number | null;
  /** Date.now()-based absolute deadline for the next technique call-out (only meaningful during 'round'). */
  nextAnnounceTimestamp: number | null;
  /** Non-null only while paused: the announce timer's frozen remaining ms. */
  pausedAnnounceRemainingMs: number | null;
  /** Round-robin pointer into techniquePool. */
  announceIndex: number;
  /** Full call-out history (with repeats) — becomes trainingHistory.techniqueIds (deduped) on finish. */
  announcedTechniqueIds: string[];
  paused: boolean;
  startedAt: string;
  finishedAt: string | null;
}
