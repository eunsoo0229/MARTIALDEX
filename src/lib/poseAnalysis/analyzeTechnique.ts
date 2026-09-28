import type { PoseFrame, PoseAnalysisResult } from './types';
import { getPoseAnalysisConfig } from './poseAnalysisConfig';
import { METRIC_CALCULATORS } from './metrics';
import { classifyScore, isImprovementArea, isStrength } from './scoring';
import { point } from './geometry';

const MIN_USABLE_FRAME_RATIO = 0.5;
const MIN_FRAMES = 8;

export type AnalyzeOutcome =
  | { ok: true; result: PoseAnalysisResult }
  | { ok: false; reason: 'unsupported' }
  | { ok: false; reason: 'no_pose_detected' };

// A frame only counts as "usable" if the core torso landmarks were
// confidently detected — a frame where the person stepped out of view
// shouldn't silently drag metrics toward a meaningless average.
function isFrameUsable(frame: PoseFrame): boolean {
  return !!(point(frame, 'leftShoulder') && point(frame, 'rightShoulder') && point(frame, 'leftHip') && point(frame, 'rightHip'));
}

export function analyzeTechnique(techniqueId: string, frames: PoseFrame[]): AnalyzeOutcome {
  const config = getPoseAnalysisConfig(techniqueId);
  if (!config?.supported) return { ok: false, reason: 'unsupported' };

  const usable = frames.filter(isFrameUsable);
  if (frames.length < MIN_FRAMES || usable.length / Math.max(1, frames.length) < MIN_USABLE_FRAME_RATIO) {
    return { ok: false, reason: 'no_pose_detected' };
  }

  const metricScores = config.metrics.map((m) => {
    const calculator = METRIC_CALCULATORS[m.id];
    const outcome = calculator ? calculator(usable, m.params ?? {}) : { score: 50, detail: '이 지표는 아직 계산 로직이 없습니다.' };
    return { id: m.id, name: m.name, score: outcome.score, detail: outcome.detail };
  });

  const overallScore = Math.round(metricScores.reduce((sum, m) => sum + m.score, 0) / metricScores.length);
  const status = classifyScore(overallScore);

  return {
    ok: true,
    result: {
      techniqueId,
      overallScore,
      status,
      metricScores,
      strengths: metricScores.filter((m) => isStrength(m.score)).map((m) => m.name),
      improvements: metricScores.filter((m) => isImprovementArea(m.score)).map((m) => m.name),
      frameCount: usable.length,
    },
  };
}
