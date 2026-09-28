import type { PostureInfo } from '../../types';
import postureData from '../../../data/curated/posture.json';

// Same pattern as data/curated/videos.json / poseAnalysis.json (see
// loadData.ts / poseAnalysisConfig.ts): a hand-curated file kept outside the
// step-2 parser's output, merged in at load time. A technique with no entry
// here — the overwhelming majority of the 1,253 — simply has no posture
// section yet, never a fabricated one.
const postures = postureData as unknown as Record<string, PostureInfo>;

export function getPostureInfo(techniqueId: string): PostureInfo | undefined {
  return postures[techniqueId];
}
