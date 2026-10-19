import type { PoseFrame, PoseLandmarkName } from '../poseAnalysis/types';
import { point } from '../poseAnalysis/geometry';
import type { SampledFrame } from './frameSampler';

export interface TrackedFrame {
  timestampSec: number;
  landmarks: PoseFrame | null;
  matched: boolean;
}

const CENTROID_LANDMARKS: PoseLandmarkName[] = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'];

export function centroidOf(frame: PoseFrame): { x: number; y: number } | null {
  const pts = CENTROID_LANDMARKS.map((n) => point(frame, n)).filter((p): p is NonNullable<typeof p> => !!p);
  if (pts.length === 0) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

// Generous but bounded — normalized [0,1] coordinates, so 0.25 is about a
// quarter of the frame width/height of allowed drift between samples.
const MAX_MATCH_DISTANCE = 0.25;

/**
 * Nearest candidate by position, optionally with an appearance penalty
 * (0 = looks like the tracked person, 1 = clearly doesn't — attire.ts). The
 * penalty only re-ranks candidates (e.g. when two fighters cross and are
 * both close); the distance limit still applies to the picked one.
 */
function nearestPose(poses: PoseFrame[], ref: { x: number; y: number }, penalty?: (pose: PoseFrame) => number): { pose: PoseFrame; distance: number } | null {
  let best: { pose: PoseFrame; distance: number; cost: number } | null = null;
  for (const pose of poses) {
    const c = centroidOf(pose);
    if (!c) continue;
    const d = Math.hypot(c.x - ref.x, c.y - ref.y);
    const cost = d + (penalty ? APPEARANCE_WEIGHT * penalty(pose) : 0);
    if (!best || cost < best.cost) best = { pose, distance: d, cost };
  }
  return best ? { pose: best.pose, distance: best.distance } : null;
}

/** How much a full appearance mismatch counts, in normalized-distance units. */
const APPEARANCE_WEIGHT = 0.15;

/** Appearance penalty for pose `poseIndex` of sample `frameIndex`, or undefined when no attire/colours are available. */
export type AppearancePenalty = (frameIndex: number, poseIndex: number) => number;

// A simple nearest-centroid tracker across INDEPENDENTLY sampled frames —
// this is position-based tracking, not identity re-recognition. If the
// tracked person and someone else cross paths, or the person leaves frame
// entirely, this can lock onto the wrong pose or lose them. Frames where no
// candidate is within MAX_MATCH_DISTANCE are left `matched: false` rather
// than guessing — downstream code (postureMetrics.ts) only uses matched
// frames, and a high loss ratio surfaces as an honest limitation notice
// (see sparringAnalysisService.ts) instead of silently degrading.
export function trackSelectedPerson(
  samples: SampledFrame[],
  referenceTimestampSec: number,
  referenceCentroid: { x: number; y: number },
  appearance?: AppearancePenalty
): TrackedFrame[] {
  const penaltyFor = (i: number) => (appearance ? (pose: PoseFrame) => appearance(i, samples[i].poses.indexOf(pose)) : undefined);
  if (samples.length === 0) return [];
  const refIndex = samples.reduce(
    (bestIdx, s, i) => (Math.abs(s.timestampSec - referenceTimestampSec) < Math.abs(samples[bestIdx].timestampSec - referenceTimestampSec) ? i : bestIdx),
    0
  );

  const tracked: TrackedFrame[] = samples.map((s) => ({ timestampSec: s.timestampSec, landmarks: null, matched: false }));

  let currentRef = referenceCentroid;
  for (let i = refIndex; i < samples.length; i++) {
    const match = nearestPose(samples[i].poses, currentRef, penaltyFor(i));
    if (match && match.distance <= MAX_MATCH_DISTANCE) {
      tracked[i] = { timestampSec: samples[i].timestampSec, landmarks: match.pose, matched: true };
      const c = centroidOf(match.pose);
      if (c) currentRef = c;
    }
  }

  currentRef = referenceCentroid;
  for (let i = refIndex - 1; i >= 0; i--) {
    const match = nearestPose(samples[i].poses, currentRef, penaltyFor(i));
    if (match && match.distance <= MAX_MATCH_DISTANCE) {
      tracked[i] = { timestampSec: samples[i].timestampSec, landmarks: match.pose, matched: true };
      const c = centroidOf(match.pose);
      if (c) currentRef = c;
    }
  }

  return tracked;
}

export function trackingLossRatio(tracked: TrackedFrame[]): number {
  if (tracked.length === 0) return 1;
  return tracked.filter((t) => !t.matched).length / tracked.length;
}

// Same nearest-centroid greedy tracker as trackSelectedPerson, aimed at "the
// other person" instead — per frame, picks whichever detected pose is
// nearest to the running opponent centroid AND is not the already-tracked
// selected person's own matched pose (so on a 2-person clip this can't lock
// onto the same body twice). Only ever produces real, honestly-labeled data:
// a frame with no plausible opponent candidate (occluded, off-screen, or a
// clip with just one person) is left `matched: false`, same discipline as
// trackSelectedPerson — never guesses. This is what lets sequenceAnalysis.ts
// compute genuine (not fabricated) opponent-motion/reaction signals.
export function trackOpponent(samples: SampledFrame[], selectedTracked: TrackedFrame[]): TrackedFrame[] {
  if (samples.length === 0) return [];
  const selectedByTime = new Map(selectedTracked.map((t) => [t.timestampSec, t]));

  // Seed the opponent reference from the first frame where at least 2 people
  // were detected and one of them isn't the selected person.
  let currentRef: { x: number; y: number } | null = null;
  let seedIndex = -1;
  for (let i = 0; i < samples.length; i++) {
    const selected = selectedByTime.get(samples[i].timestampSec);
    const selectedPose = selected?.matched ? selected.landmarks : null;
    const others = samples[i].poses.filter((p) => p !== selectedPose);
    if (others.length === 0) continue;
    const match = selectedPose ? nearestPose(others, centroidOf(selectedPose) ?? { x: 0.5, y: 0.5 }) : nearestPose(others, { x: 0.5, y: 0.5 });
    const c = match ? centroidOf(match.pose) : null;
    if (c) {
      currentRef = c;
      seedIndex = i;
      break;
    }
  }

  const tracked: TrackedFrame[] = samples.map((s) => ({ timestampSec: s.timestampSec, landmarks: null, matched: false }));
  if (!currentRef || seedIndex === -1) return tracked;

  function step(i: number, ref: { x: number; y: number }): { x: number; y: number } | null {
    const selected = selectedByTime.get(samples[i].timestampSec);
    const selectedPose = selected?.matched ? selected.landmarks : null;
    const others = samples[i].poses.filter((p) => p !== selectedPose);
    const match = nearestPose(others, ref);
    if (match && match.distance <= MAX_MATCH_DISTANCE) {
      tracked[i] = { timestampSec: samples[i].timestampSec, landmarks: match.pose, matched: true };
      return centroidOf(match.pose) ?? ref;
    }
    return null;
  }

  let ref = currentRef;
  for (let i = seedIndex; i < samples.length; i++) {
    const next = step(i, ref);
    if (next) ref = next;
  }
  ref = currentRef;
  for (let i = seedIndex - 1; i >= 0; i--) {
    const next = step(i, ref);
    if (next) ref = next;
  }

  return tracked;
}
