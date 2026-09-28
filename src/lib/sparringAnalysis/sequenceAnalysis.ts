import type { PoseFrame } from '../poseAnalysis/types';
import { nearestOtherDistance } from './motionEventDetector';
import type { TrackedFrame } from './personTracker';
import type { SampledFrame } from './frameSampler';
import type {
  DistanceBucket,
  MotionEvent,
  SequenceAnalysisResult,
  SequencePattern,
  TechniqueGuess,
  TechniqueOccurrence,
  TechniqueSequenceStats,
} from './types';

// 100% deterministic — every number here is a real count/timestamp already
// produced upstream (techniqueHypothesis.ts's TechniqueGuess occurrences,
// motionEventDetector.ts's MotionEvent timestamps, personTracker.ts's real
// tracked geometry). No AI call, no invented data — this is what lets the
// "발견된 패턴"/"공격 연결" reporting stay honest even when the optional AI
// stages (visualEventAnalysis/coachingSynthesis) fail or are skipped.

// How close two technique occurrences must be (seconds) to count as one
// "connected" to the other, rather than two unrelated, separate attacks.
// Loose enough to catch a real combo across the ~1s+ sampling gaps
// (frameSampler.ts's MIN_SAMPLE_INTERVAL_SEC) without merging genuinely
// separate exchanges minutes apart.
const FOLLOW_UP_WINDOW_SEC = 4;
// Same window used to check "did the user move (footwork/exit) shortly
// after this technique" — reuses the motion-event timeline, not a new signal.
const MOVEMENT_WINDOW_SEC = 2.5;
// A→B pair repeat count at/above this is surfaced as a "반복 패턴".
const REPEATED_PATTERN_MIN_COUNT = 3;
// How close (normalized 0-1 centroid distance) counts as "close range" —
// same threshold family as motionEventDetector.ts's CLINCH_DISTANCE_THRESHOLD,
// just bucketed into 3 bands instead of a single clinch/not-clinch cut.
const CLOSE_DISTANCE = 0.22;
const MID_DISTANCE = 0.4;
// How soon before a user occurrence an opponent event counts as "user reacted to it".
const REACTIVE_WINDOW_SEC = 2;

function buildTimeline(techniqueGuesses: TechniqueGuess[]): TechniqueOccurrence[] {
  const timeline: TechniqueOccurrence[] = [];
  for (const g of techniqueGuesses) {
    for (const t of g.occurrences) {
      timeline.push({ techniqueId: g.techniqueId, techniqueName: g.techniqueName, timestampSec: t });
    }
  }
  return timeline.sort((a, b) => a.timestampSec - b.timestampSec);
}

function distanceBucketAt(timestampSec: number, tracked: TrackedFrame[], samples: SampledFrame[]): DistanceBucket | null {
  // Nearest sampled/tracked frame at or before this timestamp — occurrences
  // land on real sample timestamps already (they come from motion events
  // detected between consecutive samples), so an exact or near-exact match
  // is expected; a small tolerance covers floating-point timestamp drift.
  const frame = tracked.find((t) => Math.abs(t.timestampSec - timestampSec) < 0.05 && t.matched && t.landmarks);
  if (!frame?.landmarks) return null;
  const sample = samples.find((s) => Math.abs(s.timestampSec - timestampSec) < 0.05);
  if (!sample) return null;
  const others = sample.poses.filter((p: PoseFrame) => p !== frame.landmarks);
  const dist = nearestOtherDistance(frame.landmarks, others);
  if (dist === null) return null;
  if (dist <= CLOSE_DISTANCE) return 'close';
  if (dist <= MID_DISTANCE) return 'mid';
  return 'far';
}

function movedWithin(timestampSec: number, motionEvents: MotionEvent[]): boolean | null {
  const window = motionEvents.filter((e) => e.timestampSec > timestampSec && e.timestampSec <= timestampSec + MOVEMENT_WINDOW_SEC);
  if (window.length === 0) return null;
  return window.some((e) => e.category === 'footwork_movement' || e.category === 'distance_exit_like');
}

/**
 * Turns the already-detected technique occurrences into real, counted A→B
 * transitions, solo-vs-combination classification, per-technique follow-up/
 * distance/movement stats, and — when opponent tracking data is available —
 * a reactive-vs-initiating ratio. See spec sections 2/5 ("JAB → CROSS" style
 * patterns, "공격 후 후속 행동", "선공/후공 경향").
 */
export function analyzeSequences(
  techniqueGuesses: TechniqueGuess[],
  motionEvents: MotionEvent[],
  tracked: TrackedFrame[],
  samples: SampledFrame[],
  opponentMotionEvents: MotionEvent[] | null
): SequenceAnalysisResult {
  const timeline = buildTimeline(techniqueGuesses);

  const patternCounts = new Map<string, SequencePattern>();
  function bumpPattern(from: TechniqueOccurrence, to: TechniqueOccurrence | null) {
    const key = `${from.techniqueId}→${to?.techniqueId ?? 'none'}`;
    const existing = patternCounts.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    patternCounts.set(key, {
      fromTechniqueId: from.techniqueId,
      fromTechniqueName: from.techniqueName,
      toTechniqueId: to?.techniqueId ?? null,
      toTechniqueName: to?.techniqueName ?? null,
      count: 1,
    });
  }

  const perTechniqueMap = new Map<string, TechniqueSequenceStats>();
  function statsFor(techniqueId: string, techniqueName: string): TechniqueSequenceStats {
    let s = perTechniqueMap.get(techniqueId);
    if (!s) {
      s = {
        techniqueId,
        techniqueName,
        occurrenceCount: 0,
        soloCount: 0,
        comboCount: 0,
        followUpCount: 0,
        noFollowUpCount: 0,
        distanceBuckets: {},
        movedAfterCount: 0,
        stayedStillCount: 0,
      };
      perTechniqueMap.set(techniqueId, s);
    }
    return s;
  }

  let soloCount = 0;
  let combinationCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const cur = timeline[i];
    const stats = statsFor(cur.techniqueId, cur.techniqueName);
    stats.occurrenceCount++;

    const next = timeline[i + 1];
    const hasFollowUp = !!next && next.timestampSec - cur.timestampSec <= FOLLOW_UP_WINDOW_SEC;
    const hasPrecedingWithinWindow = i > 0 && cur.timestampSec - timeline[i - 1].timestampSec <= FOLLOW_UP_WINDOW_SEC;
    const isCombination = hasFollowUp || hasPrecedingWithinWindow;
    if (isCombination) {
      combinationCount++;
      stats.comboCount++;
    } else {
      soloCount++;
      stats.soloCount++;
    }

    if (hasFollowUp) stats.followUpCount++;
    else stats.noFollowUpCount++;
    bumpPattern(cur, hasFollowUp ? next : null);

    const bucket = distanceBucketAt(cur.timestampSec, tracked, samples);
    if (bucket) stats.distanceBuckets[bucket] = (stats.distanceBuckets[bucket] ?? 0) + 1;

    const moved = movedWithin(cur.timestampSec, motionEvents);
    if (moved === true) stats.movedAfterCount++;
    else if (moved === false) stats.stayedStillCount++;
  }

  const patterns = [...patternCounts.values()].sort((a, b) => b.count - a.count);
  const repeatedPatterns = patterns.filter((p) => p.count >= REPEATED_PATTERN_MIN_COUNT);

  let reactiveRatio: number | null = null;
  let initiatingRatio: number | null = null;
  if (opponentMotionEvents && opponentMotionEvents.length > 0 && timeline.length > 0) {
    let reactive = 0;
    for (const occ of timeline) {
      const precededByOpponent = opponentMotionEvents.some(
        (e) => e.timestampSec < occ.timestampSec && occ.timestampSec - e.timestampSec <= REACTIVE_WINDOW_SEC
      );
      if (precededByOpponent) reactive++;
    }
    reactiveRatio = reactive / timeline.length;
    initiatingRatio = 1 - reactiveRatio;
  }

  return {
    timeline,
    patterns,
    repeatedPatterns,
    perTechnique: [...perTechniqueMap.values()],
    soloCount,
    combinationCount,
    reactiveRatio,
    initiatingRatio,
  };
}
