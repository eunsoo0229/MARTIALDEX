import type { PoseAnalysisConfig } from './types';
import poseAnalysisData from '../../../data/curated/poseAnalysis.json';

// Same pattern as data/curated/videos.json (see loadData.ts): a hand-curated
// file kept outside the step-2 parser's output, merged in at load time. A
// technique with no entry here — the overwhelming majority of the 1,253 —
// is simply unsupported, not an error.
const configs = poseAnalysisData as unknown as Record<string, PoseAnalysisConfig>;

export function getPoseAnalysisConfig(techniqueId: string): PoseAnalysisConfig | undefined {
  return configs[techniqueId];
}

export function isPoseAnalysisSupported(techniqueId: string): boolean {
  return configs[techniqueId]?.supported === true;
}

export function listSupportedTechniqueIds(): string[] {
  return Object.keys(configs);
}
