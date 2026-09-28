import type { PoseFrame, PoseLandmarkName, PoseLandmarkPoint } from './types';

const MIN_VISIBILITY = 0.5;

export function point(frame: PoseFrame, name: PoseLandmarkName): PoseLandmarkPoint | null {
  const p = frame[name];
  if (!p || p.visibility < MIN_VISIBILITY) return null;
  return p;
}

export function distance(a: PoseLandmarkPoint, b: PoseLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: PoseLandmarkPoint, b: PoseLandmarkPoint): PoseLandmarkPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, visibility: Math.min(a.visibility, b.visibility) };
}

/** Angle at vertex `b`, formed by rays b->a and b->c, in degrees (0-180). */
export function angleAt(a: PoseLandmarkPoint, b: PoseLandmarkPoint, c: PoseLandmarkPoint): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Signed angle (degrees) of the line a->b relative to horizontal — used for shoulder/hip rotation. */
export function lineAngle(a: PoseLandmarkPoint, b: PoseLandmarkPoint): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Population standard deviation — used as a "how stable/consistent was this over time" signal. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Converts "how far a measured value is from an ideal target" into a 0-100
 * score. `tolerance` is the distance from target at which the score hits 0 —
 * i.e. a linear falloff, not a hard pass/fail cutoff.
 */
export function scoreFromDeviation(value: number, target: number, tolerance: number): number {
  const deviation = Math.abs(value - target);
  return clampScore(100 * (1 - deviation / tolerance));
}

/** Lower stdDev = more stable = higher score. `tolerance` is the stdDev at which score hits 0. */
export function scoreFromStability(values: number[], tolerance: number): number {
  return clampScore(100 * (1 - stdDev(values) / tolerance));
}

export function pickFrameMaximizing(frames: PoseFrame[], metric: (f: PoseFrame) => number | null): PoseFrame | null {
  let best: PoseFrame | null = null;
  let bestValue = -Infinity;
  for (const f of frames) {
    const v = metric(f);
    if (v !== null && v > bestValue) {
      bestValue = v;
      best = f;
    }
  }
  return best;
}
