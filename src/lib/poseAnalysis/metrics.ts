import type { MetricResult, PoseFrame, PoseLandmarkPoint } from './types';
import { angleAt, clampScore, distance, lineAngle, midpoint, point, scoreFromDeviation, scoreFromStability } from './geometry';

export interface MetricParams {
  targetAngle?: number;
  targetRotation?: number;
  targetRise?: number;
  targetDisplacement?: number;
  targetDrop?: number;
  tolerance?: number;
  mode?: 'guard';
}

type Side = 'left' | 'right';

function kneeAngle(frame: PoseFrame, side: Side): number | null {
  const hip = point(frame, side === 'left' ? 'leftHip' : 'rightHip');
  const knee = point(frame, side === 'left' ? 'leftKnee' : 'rightKnee');
  const ankle = point(frame, side === 'left' ? 'leftAnkle' : 'rightAnkle');
  if (!hip || !knee || !ankle) return null;
  return angleAt(hip, knee, ankle);
}

function elbowAngle(frame: PoseFrame, side: Side): number | null {
  const shoulder = point(frame, side === 'left' ? 'leftShoulder' : 'rightShoulder');
  const elbow = point(frame, side === 'left' ? 'leftElbow' : 'rightElbow');
  const wrist = point(frame, side === 'left' ? 'leftWrist' : 'rightWrist');
  if (!shoulder || !elbow || !wrist) return null;
  return angleAt(shoulder, elbow, wrist);
}

function hipMid(frame: PoseFrame): PoseLandmarkPoint | null {
  const l = point(frame, 'leftHip');
  const r = point(frame, 'rightHip');
  return l && r ? midpoint(l, r) : null;
}

function bodyScaleUnit(frame: PoseFrame, side: Side): number {
  const hip = point(frame, side === 'left' ? 'leftHip' : 'rightHip');
  const knee = point(frame, side === 'left' ? 'leftKnee' : 'rightKnee');
  if (!hip || !knee) return 0.2; // a reasonable normalized-coordinate fallback
  return Math.max(0.05, distance(hip, knee));
}

// Finds which arm extended further from its shoulder at any point in the
// recording (the presumed striking arm) and the frame where that extension
// peaked — used as the "moment of the strike" for angle/rotation metrics.
function findPunchPeak(frames: PoseFrame[]): { side: Side; peakIndex: number } | null {
  let best: { side: Side; peakIndex: number; value: number } | null = null;
  (['left', 'right'] as Side[]).forEach((side) => {
    frames.forEach((f, i) => {
      const shoulder = point(f, side === 'left' ? 'leftShoulder' : 'rightShoulder');
      const wrist = point(f, side === 'left' ? 'leftWrist' : 'rightWrist');
      if (!shoulder || !wrist) return;
      const d = distance(shoulder, wrist);
      if (!best || d > best.value) best = { side, peakIndex: i, value: d };
    });
  });
  return best;
}

// Finds which leg lifted highest relative to the hips (the presumed kicking
// leg) and the frame where that lift peaked.
function findKickPeak(frames: PoseFrame[]): { side: Side; peakIndex: number } | null {
  let best: { side: Side; peakIndex: number; value: number } | null = null;
  (['left', 'right'] as Side[]).forEach((side) => {
    frames.forEach((f, i) => {
      const hip = point(f, side === 'left' ? 'leftHip' : 'rightHip');
      const ankle = point(f, side === 'left' ? 'leftAnkle' : 'rightAnkle');
      if (!hip || !ankle) return;
      const lift = hip.y - ankle.y; // image y grows downward, so a higher foot = smaller ankle.y
      if (!best || lift > best.value) best = { side, peakIndex: i, value: lift };
    });
  });
  return best;
}

function fmt(n: number): string {
  return Math.round(n).toString();
}

// ---------------------------------------------------------------------
// Metric calculators. Every one reads real landmark coordinates captured
// during the recording — none of them return a random or hardcoded score.
// A calculator that can't find the landmarks it needs returns a neutral
// score with a note, rather than fabricating a result.
// ---------------------------------------------------------------------

export const METRIC_CALCULATORS: Record<string, (frames: PoseFrame[], params: MetricParams) => Omit<MetricResult, 'id'>> = {
  basicStance(frames, params) {
    const angles = frames.flatMap((f) => [kneeAngle(f, 'left'), kneeAngle(f, 'right')]).filter((v): v is number => v !== null);
    if (angles.length === 0) return { score: 50, detail: '무릎 위치를 카메라에서 충분히 인식하지 못했습니다.' };
    const avg = angles.reduce((a, b) => a + b, 0) / angles.length;
    const target = params.targetAngle ?? 155;
    const tolerance = params.tolerance ?? 35;
    return {
      score: scoreFromDeviation(avg, target, tolerance),
      detail: `평균 무릎 굽힘 각도 ${fmt(avg)}도를 기준 자세(약 ${target}도)와 비교했습니다.`,
    };
  },

  armPosition(frames, params) {
    if (params.mode === 'guard') {
      const devs: number[] = [];
      for (const f of frames) {
        const nose = point(f, 'nose');
        const lw = point(f, 'leftWrist');
        const rw = point(f, 'rightWrist');
        if (!nose) continue;
        if (lw) devs.push(Math.max(0, lw.y - nose.y));
        if (rw) devs.push(Math.max(0, rw.y - nose.y));
      }
      if (devs.length === 0) return { score: 50, detail: '손 위치를 카메라에서 충분히 인식하지 못했습니다.' };
      const avgDrop = devs.reduce((a, b) => a + b, 0) / devs.length;
      return {
        score: scoreFromDeviation(avgDrop, 0, params.tolerance ?? 0.18),
        detail: '양손이 머리 높이 근처에 머물렀는지를 기준으로 측정했습니다.',
      };
    }
    const peak = findPunchPeak(frames);
    if (!peak) return { score: 50, detail: '팔 동작을 카메라에서 충분히 인식하지 못했습니다.' };
    const angle = elbowAngle(frames[peak.peakIndex], peak.side);
    if (angle === null) return { score: 50, detail: '팔꿈치 각도를 계산할 수 없었습니다.' };
    const target = params.targetAngle ?? 165;
    const tolerance = params.tolerance ?? 45;
    return {
      score: scoreFromDeviation(angle, target, tolerance),
      detail: `가장 뻗은 순간의 팔꿈치 각도 ${fmt(angle)}도를 기준(약 ${target}도)과 비교했습니다.`,
    };
  },

  rotation(frames, params) {
    const peak = findPunchPeak(frames);
    if (!peak) return { score: 50, detail: '몸통 회전을 계산할 수 없었습니다.' };
    const start = frames[0];
    const peakFrame = frames[peak.peakIndex];
    const ls0 = point(start, 'leftShoulder');
    const rs0 = point(start, 'rightShoulder');
    const ls1 = point(peakFrame, 'leftShoulder');
    const rs1 = point(peakFrame, 'rightShoulder');
    if (!ls0 || !rs0 || !ls1 || !rs1) return { score: 50, detail: '어깨 위치를 충분히 인식하지 못했습니다.' };
    const delta = Math.abs(lineAngle(ls1, rs1) - lineAngle(ls0, rs0));
    const target = params.targetRotation ?? 25;
    const tolerance = params.tolerance ?? 35;
    return {
      score: scoreFromDeviation(delta, target, tolerance),
      detail: `시작 자세 대비 어깨선 회전량 ${fmt(delta)}도를 기준(약 ${target}도)과 비교했습니다.`,
    };
  },

  hipRotation(frames, params) {
    const kick = findKickPeak(frames);
    if (!kick) return { score: 50, detail: '골반 회전을 계산할 수 없었습니다.' };
    const start = frames[0];
    const peakFrame = frames[kick.peakIndex];
    const lh0 = point(start, 'leftHip');
    const rh0 = point(start, 'rightHip');
    const lh1 = point(peakFrame, 'leftHip');
    const rh1 = point(peakFrame, 'rightHip');
    if (!lh0 || !rh0 || !lh1 || !rh1) return { score: 50, detail: '골반 위치를 충분히 인식하지 못했습니다.' };
    const delta = Math.abs(lineAngle(lh1, rh1) - lineAngle(lh0, rh0));
    const target = params.targetRotation ?? 40;
    const tolerance = params.tolerance ?? 40;
    return {
      score: scoreFromDeviation(delta, target, tolerance),
      detail: `걷어차는 순간의 골반 회전량 ${fmt(delta)}도를 기준(약 ${target}도)과 비교했습니다.`,
    };
  },

  balance(frames) {
    const xs = frames.map((f) => hipMid(f)).filter((p): p is PoseLandmarkPoint => p !== null).map((p) => p.x);
    if (xs.length < 3) return { score: 50, detail: '골반 위치를 충분히 인식하지 못했습니다.' };
    return {
      score: scoreFromStability(xs, 0.07),
      detail: '동작 동안 골반 중심의 좌우 흔들림을 측정했습니다.',
    };
  },

  headPosition(frames) {
    const deviations: number[] = [];
    for (const f of frames) {
      const nose = point(f, 'nose');
      const hm = hipMid(f);
      if (!nose || !hm) continue;
      deviations.push(Math.abs(nose.x - hm.x));
    }
    if (deviations.length === 0) return { score: 50, detail: '머리 위치를 충분히 인식하지 못했습니다.' };
    const avg = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    return {
      score: scoreFromDeviation(avg, 0, 0.1),
      detail: '머리가 골반 중심선 위에 유지되었는지를 측정했습니다.',
    };
  },

  supportLegStability(frames) {
    const kick = findKickPeak(frames);
    if (!kick) return { score: 50, detail: '지지 다리를 식별하지 못했습니다.' };
    const supportSide: Side = kick.side === 'left' ? 'right' : 'left';
    const points = frames
      .map((f) => point(f, supportSide === 'left' ? 'leftAnkle' : 'rightAnkle'))
      .filter((p): p is PoseLandmarkPoint => p !== null);
    if (points.length < 3) return { score: 50, detail: '지지 다리를 충분히 인식하지 못했습니다.' };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const combined = Math.hypot(
      100 * (1 - Math.min(1, stdDevRatio(xs, 0.05))),
      100 * (1 - Math.min(1, stdDevRatio(ys, 0.05)))
    ) / Math.SQRT2;
    return { score: clampScore(combined), detail: '차는 동안 지지 다리 발목의 흔들림을 측정했습니다.' };
  },

  kneePosition(frames, params) {
    const kick = findKickPeak(frames);
    if (!kick) return { score: 50, detail: '무릎 위치를 계산할 수 없었습니다.' };
    const start = frames[0];
    const peakFrame = frames[kick.peakIndex];
    const hipStart = point(start, kick.side === 'left' ? 'leftHip' : 'rightHip');
    const kneeStart = point(start, kick.side === 'left' ? 'leftKnee' : 'rightKnee');
    const kneePeak = point(peakFrame, kick.side === 'left' ? 'leftKnee' : 'rightKnee');
    if (!hipStart || !kneeStart || !kneePeak) return { score: 50, detail: '무릎 위치를 충분히 인식하지 못했습니다.' };
    const unit = bodyScaleUnit(start, kick.side);
    const rise = (kneeStart.y - kneePeak.y) / unit;
    const target = params.targetRise ?? 0.6;
    const tolerance = params.tolerance ?? 0.5;
    return {
      score: scoreFromDeviation(rise, target, tolerance),
      detail: '차는 다리 무릎이 시작 자세 대비 얼마나 높이 올라갔는지 측정했습니다.',
    };
  },

  legMovement(frames, params) {
    const kick = findKickPeak(frames);
    if (!kick) return { score: 50, detail: '다리 움직임을 계산할 수 없었습니다.' };
    const start = frames[0];
    const peakFrame = frames[kick.peakIndex];
    const ankleStart = point(start, kick.side === 'left' ? 'leftAnkle' : 'rightAnkle');
    const anklePeak = point(peakFrame, kick.side === 'left' ? 'leftAnkle' : 'rightAnkle');
    if (!ankleStart || !anklePeak) return { score: 50, detail: '다리 움직임을 충분히 인식하지 못했습니다.' };
    const unit = bodyScaleUnit(start, kick.side);
    const displacement = distance(ankleStart, anklePeak) / unit;
    const target = params.targetDisplacement ?? 1.2;
    const tolerance = params.tolerance ?? 1.0;
    return {
      score: scoreFromDeviation(displacement, target, tolerance),
      detail: '차는 발이 시작 위치에서 얼마나 이동했는지 측정했습니다.',
    };
  },

  levelChange(frames, params) {
    const hips = frames.map((f) => hipMid(f)).filter((p): p is PoseLandmarkPoint => p !== null);
    if (hips.length < 3) return { score: 50, detail: '골반 높이를 충분히 인식하지 못했습니다.' };
    const startY = hips[0].y;
    const maxY = Math.max(...hips.map((p) => p.y));
    const unit = bodyScaleUnit(frames[0], 'left');
    const drop = (maxY - startY) / unit;
    const target = params.targetDrop ?? 0.5;
    const tolerance = params.tolerance ?? 0.4;
    return {
      score: scoreFromDeviation(drop, target, tolerance),
      detail: '시작 자세 대비 골반이 얼마나 낮아졌는지 측정했습니다.',
    };
  },
};

function stdDevRatio(values: number[], tolerance: number): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / tolerance;
}
