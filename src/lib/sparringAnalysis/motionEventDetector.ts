import type { PoseFrame } from '../poseAnalysis/types';
import { distance, point } from '../poseAnalysis/geometry';
import type { TrackedFrame } from './personTracker';
import { centroidOf } from './personTracker';
import type { SampledFrame } from './frameSampler';
import type { MotionEvent } from './types';
import { MOTION_EVENT_LABEL } from './types';

// Heuristic, geometry-only "motion event" detection over the TRACKED
// person's landmarks — never a trained action-recognition model, and never
// labeled with a specific technique name here (that would claim more
// certainty than a velocity/geometry threshold can support). Categories are
// deliberately generic ("타격성 동작", not "Jab") — see techniqueHypothesis.ts
// for the separate, explicitly-optional, whitelist-validated step that maps
// these to real technique names.

interface UsableFrame {
  timestampSec: number;
  landmarks: PoseFrame;
}

function toUsable(tracked: TrackedFrame[]): UsableFrame[] {
  const out: UsableFrame[] = [];
  for (const t of tracked) if (t.matched && t.landmarks) out.push({ timestampSec: t.timestampSec, landmarks: t.landmarks });
  return out;
}

function bodyUnit(f: PoseFrame): number {
  const ls = point(f, 'leftShoulder');
  const lh = point(f, 'leftHip');
  return ls && lh ? Math.max(0.05, distance(ls, lh)) : 0.25;
}

function maxWristSpeed(a: PoseFrame, b: PoseFrame, dt: number): number {
  let max = 0;
  for (const side of ['leftWrist', 'rightWrist'] as const) {
    const pa = point(a, side);
    const pb = point(b, side);
    if (pa && pb) max = Math.max(max, distance(pa, pb) / dt);
  }
  return max;
}

// Mirrors maxWristSpeed exactly, over the ankle landmarks instead — kicks were
// previously entirely undetected (only wrist speed was tracked), even though
// leftAnkle/rightAnkle are already part of the tracked landmark set (see
// postureMetrics.ts's footPosition metric). This is a genuine detection gap
// fix, not sport-specific — every sport's profile decides separately whether
// kick_like is relevant to surface (see sportAnalysisProfiles.ts).
function maxAnkleSpeed(a: PoseFrame, b: PoseFrame, dt: number): number {
  let max = 0;
  for (const side of ['leftAnkle', 'rightAnkle'] as const) {
    const pa = point(a, side);
    const pb = point(b, side);
    if (pa && pb) max = Math.max(max, distance(pa, pb) / dt);
  }
  return max;
}

function hipMidY(f: PoseFrame): number | null {
  const lh = point(f, 'leftHip');
  const rh = point(f, 'rightHip');
  return lh && rh ? (lh.y + rh.y) / 2 : null;
}

// Exported for sequenceAnalysis.ts's per-occurrence distance bucketing — the
// exact same "how far is the tracked person from the nearest other detected
// person" computation the clinch/exit detection above already relies on, so
// distance buckets stay consistent with what clinch_like/distance_exit_like
// already mean instead of introducing a second distance notion.
export function nearestOtherDistance(tracked: PoseFrame, others: PoseFrame[]): number | null {
  const c = centroidOf(tracked);
  if (!c) return null;
  let min: number | null = null;
  for (const o of others) {
    const oc = centroidOf(o);
    if (!oc) continue;
    const d = Math.hypot(c.x - oc.x, c.y - oc.y);
    if (min === null || d < min) min = d;
  }
  return min;
}

// Calibrated for DISPLACEMENT BETWEEN SAMPLES, not true instantaneous
// velocity — buildSampleTimestamps() spaces samples ~1-2s apart by default
// (each sample is a real, if slow, WASM inference call), so a strike that
// starts and fully retracts within that gap can be under-sampled entirely.
// These thresholds are set to catch large, obvious displacements at that
// sampling density rather than a true punch-speed measurement — see README
// "실제 스파링 영상 기반 AI 분석" for this honestly-disclosed limitation.
const STRIKE_SPEED_THRESHOLD = 0.28;
// Set slightly above STRIKE_SPEED_THRESHOLD: ordinary stepping/footwork
// already moves the ankles, so this only fires on a fast, large ankle
// displacement (a kick swing), not routine walking.
const KICK_SPEED_THRESHOLD = 0.32;
const LEVEL_DROP_RATIO_THRESHOLD = 0.35;
const LATERAL_SPEED_THRESHOLD = 0.18;
const CLINCH_DISTANCE_THRESHOLD = 0.22;
const EXIT_SPEED_THRESHOLD = 0.22;
const GUARD_HOLD_MIN_RUN = 3;

export function detectMotionEvents(tracked: TrackedFrame[], samples: SampledFrame[]): MotionEvent[] {
  const usable = toUsable(tracked);
  const events: MotionEvent[] = [];
  const sampleByTime = new Map(samples.map((s) => [s.timestampSec, s]));

  let wasClose = false;
  for (let i = 1; i < usable.length; i++) {
    const prev = usable[i - 1];
    const cur = usable[i];
    const dt = Math.max(0.1, cur.timestampSec - prev.timestampSec);

    const wristSpeed = maxWristSpeed(prev.landmarks, cur.landmarks, dt);
    if (wristSpeed >= STRIKE_SPEED_THRESHOLD) {
      events.push({
        timestampSec: cur.timestampSec,
        category: 'strike_like',
        label: MOTION_EVENT_LABEL.strike_like,
        confidence: wristSpeed >= STRIKE_SPEED_THRESHOLD * 1.4 ? 'medium' : 'low',
      });
    }

    const ankleSpeed = maxAnkleSpeed(prev.landmarks, cur.landmarks, dt);
    if (ankleSpeed >= KICK_SPEED_THRESHOLD) {
      events.push({
        timestampSec: cur.timestampSec,
        category: 'kick_like',
        label: MOTION_EVENT_LABEL.kick_like,
        confidence: ankleSpeed >= KICK_SPEED_THRESHOLD * 1.4 ? 'medium' : 'low',
      });
    }

    const hy0 = hipMidY(prev.landmarks);
    const hy1 = hipMidY(cur.landmarks);
    if (hy0 !== null && hy1 !== null) {
      const dropRatio = (hy1 - hy0) / bodyUnit(cur.landmarks);
      if (dropRatio >= LEVEL_DROP_RATIO_THRESHOLD) {
        events.push({
          timestampSec: cur.timestampSec,
          category: 'level_change_like',
          label: MOTION_EVENT_LABEL.level_change_like,
          confidence: dropRatio >= LEVEL_DROP_RATIO_THRESHOLD * 1.5 ? 'medium' : 'low',
        });
      }
    }

    const c0 = centroidOf(prev.landmarks);
    const c1 = centroidOf(cur.landmarks);
    if (c0 && c1 && Math.abs(c1.x - c0.x) / dt >= LATERAL_SPEED_THRESHOLD) {
      events.push({ timestampSec: cur.timestampSec, category: 'footwork_movement', label: MOTION_EVENT_LABEL.footwork_movement, confidence: 'low' });
    }

    const curSample = sampleByTime.get(cur.timestampSec);
    const others = curSample ? curSample.poses.filter((p) => p !== cur.landmarks) : [];
    const nearestDist = nearestOtherDistance(cur.landmarks, others);
    const isClose = nearestDist !== null && nearestDist <= CLINCH_DISTANCE_THRESHOLD;
    if (isClose && !wasClose) {
      events.push({ timestampSec: cur.timestampSec, category: 'clinch_like', label: MOTION_EVENT_LABEL.clinch_like, confidence: 'low' });
    }
    if (wasClose && !isClose && c0 && c1) {
      const exitSpeed = Math.hypot(c1.x - c0.x, c1.y - c0.y) / dt;
      if (exitSpeed >= EXIT_SPEED_THRESHOLD) {
        events.push({ timestampSec: cur.timestampSec, category: 'distance_exit_like', label: MOTION_EVENT_LABEL.distance_exit_like, confidence: 'low' });
      }
    }
    wasClose = isClose;
  }

  // guard_hold_like is a plateau, not a spike — a run of consecutive
  // low-motion frames with hands kept up near head height.
  const eventTimes = new Set(events.map((e) => e.timestampSec));
  let runStart: number | null = null;
  for (let i = 0; i <= usable.length; i++) {
    const f = i < usable.length ? usable[i].landmarks : null;
    const nose = f ? point(f, 'nose') : null;
    const lw = f ? point(f, 'leftWrist') : null;
    const rw = f ? point(f, 'rightWrist') : null;
    const guardUp = !!f && !!nose && ((!!lw && lw.y <= nose.y + 0.1) || (!!rw && rw.y <= nose.y + 0.1));
    const blocked = f ? eventTimes.has(usable[i].timestampSec) : false;
    if (guardUp && !blocked) {
      if (runStart === null) runStart = i;
    } else {
      if (runStart !== null && i - runStart >= GUARD_HOLD_MIN_RUN) {
        const mid = usable[Math.floor((runStart + i - 1) / 2)];
        events.push({ timestampSec: mid.timestampSec, category: 'guard_hold_like', label: MOTION_EVENT_LABEL.guard_hold_like, confidence: 'low' });
      }
      runStart = null;
    }
  }

  return events.sort((a, b) => a.timestampSec - b.timestampSec);
}
