import type { PoseFrame } from '../poseAnalysis/types';
import { distance, mean, point, scoreFromDeviation, scoreFromStability } from '../poseAnalysis/geometry';
import { classifyScore } from '../poseAnalysis/scoring';
import type { TrackedFrame } from './personTracker';
import type { PostureMetricResult, PostureSegment, PostureSegmentKey } from './types';

// Reuses the exact same geometry primitives (distance/mean/scoreFromDeviation/
// scoreFromStability) and score-band thresholds (classifyScore) as the
// single-technique camera analysis in poseAnalysis/metrics.ts — a sparring
// clip just has no single "ideal angle" to compare against, so these are
// general posture indicators (guard height, stance width, balance, foot
// stagger) instead of a technique-specific target.

const SEGMENT_LABEL: Record<PostureSegmentKey, string> = { early: '초반', mid: '중반', late: '후반' };

function splitIntoThirds<T>(arr: T[]): [T[], T[], T[]] {
  const n = arr.length;
  return [arr.slice(0, Math.ceil(n / 3)), arr.slice(Math.ceil(n / 3), Math.ceil((2 * n) / 3)), arr.slice(Math.ceil((2 * n) / 3))];
}

function guardScore(frames: PoseFrame[]): number | null {
  const devs: number[] = [];
  for (const f of frames) {
    const nose = point(f, 'nose');
    if (!nose) continue;
    const lw = point(f, 'leftWrist');
    const rw = point(f, 'rightWrist');
    if (lw) devs.push(Math.max(0, lw.y - nose.y));
    if (rw) devs.push(Math.max(0, rw.y - nose.y));
  }
  if (devs.length < 2) return null;
  return scoreFromDeviation(mean(devs), 0, 0.22);
}

function stanceScore(frames: PoseFrame[]): number | null {
  const ratios: number[] = [];
  for (const f of frames) {
    const la = point(f, 'leftAnkle');
    const ra = point(f, 'rightAnkle');
    const ls = point(f, 'leftShoulder');
    const rs = point(f, 'rightShoulder');
    if (!la || !ra || !ls || !rs) continue;
    const shoulderWidth = distance(ls, rs) || 0.001;
    ratios.push(distance(la, ra) / shoulderWidth);
  }
  if (ratios.length < 2) return null;
  return scoreFromDeviation(mean(ratios), 1.1, 0.9);
}

function balanceScore(frames: PoseFrame[]): number | null {
  const xs: number[] = [];
  for (const f of frames) {
    const lh = point(f, 'leftHip');
    const rh = point(f, 'rightHip');
    if (!lh || !rh) continue;
    xs.push((lh.x + rh.x) / 2);
  }
  if (xs.length < 3) return null;
  return scoreFromStability(xs, 0.08);
}

function footPositionScore(frames: PoseFrame[]): number | null {
  const staggers: number[] = [];
  for (const f of frames) {
    const la = point(f, 'leftAnkle');
    const ra = point(f, 'rightAnkle');
    const ls = point(f, 'leftShoulder');
    const rs = point(f, 'rightShoulder');
    if (!la || !ra || !ls || !rs) continue;
    const shoulderWidth = distance(ls, rs) || 0.001;
    staggers.push(Math.abs(la.y - ra.y) / shoulderWidth);
  }
  if (staggers.length < 2) return null;
  return scoreFromDeviation(mean(staggers), 0.5, 0.7);
}

function toResult(id: PostureMetricResult['id'], label: string, score: number | null): PostureMetricResult | null {
  if (score === null) return null;
  return { id, label, score, status: classifyScore(score) };
}

/** Only usable (tracked, matched) frames ever feed these metrics — an untracked frame contributes nothing rather than a guess. */
export function computePostureSegments(tracked: TrackedFrame[]): PostureSegment[] {
  const usable = tracked.filter((t): t is TrackedFrame & { landmarks: PoseFrame } => t.matched && !!t.landmarks);
  if (usable.length < 4) return [];

  const [early, mid, late] = splitIntoThirds(usable);
  const buckets: { key: PostureSegmentKey; frames: PoseFrame[] }[] = [
    { key: 'early', frames: early.map((f) => f.landmarks) },
    { key: 'mid', frames: mid.map((f) => f.landmarks) },
    { key: 'late', frames: late.map((f) => f.landmarks) },
  ];

  const segments: PostureSegment[] = [];
  for (const { key, frames } of buckets) {
    if (frames.length < 2) continue;
    const metrics = [
      toResult('guard', 'Guard', guardScore(frames)),
      toResult('stance', 'Stance', stanceScore(frames)),
      toResult('balance', 'Balance', balanceScore(frames)),
      toResult('footPosition', 'Foot Position', footPositionScore(frames)),
    ].filter((m): m is PostureMetricResult => m !== null);
    if (metrics.length === 0) continue;
    segments.push({ segment: key, label: SEGMENT_LABEL[key], metrics, note: null });
  }

  // The only cross-segment "trend" claim made — and only when the numbers
  // actually show it, phrased as an observation, not a diagnosis (per spec
  // 12: never assert fatigue/condition, only "이러한 움직임이 관찰됨").
  const earlyGuard = segments.find((s) => s.segment === 'early')?.metrics.find((m) => m.id === 'guard');
  const lateSeg = segments.find((s) => s.segment === 'late');
  const lateGuard = lateSeg?.metrics.find((m) => m.id === 'guard');
  if (earlyGuard && lateSeg && lateGuard && lateGuard.score < earlyGuard.score - 10) {
    lateSeg.note = '영상 후반부에 가드 손 위치가 다소 낮아지는 경향이 관찰되었습니다(참고용 관찰이며, 체력 상태를 확정하지 않습니다).';
  }

  return segments;
}

export function overallPostureScore(segments: PostureSegment[]): number | null {
  const all = segments.flatMap((s) => s.metrics.map((m) => m.score));
  if (!all.length) return null;
  return Math.round(mean(all));
}
