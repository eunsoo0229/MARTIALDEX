import type { PoseAnalysisConfig } from './types';
import { equivalentTechniqueIds } from '../techniqueCanonical';
import poseAnalysisData from '../../../data/curated/poseAnalysis.json';

// Same pattern as data/curated/videos.json (see loadData.ts): a hand-curated
// file kept outside the step-2 parser's output, merged in at load time. A
// technique with no entry here — the overwhelming majority of the 1,253 —
// is simply unsupported, not an error.
const configs = poseAnalysisData as unknown as Record<string, PoseAnalysisConfig>;

// Configs are keyed by the original record id; a canonical technique uses
// whichever of its merged records has one.
export function getPoseAnalysisConfig(techniqueId: string): PoseAnalysisConfig | undefined {
  if (configs[techniqueId]) return configs[techniqueId];
  for (const id of equivalentTechniqueIds(techniqueId)) if (configs[id]) return configs[id];
  return undefined;
}

export function isPoseAnalysisSupported(techniqueId: string): boolean {
  return getPoseAnalysisConfig(techniqueId)?.supported === true;
}

export function listSupportedTechniqueIds(): string[] {
  return Object.keys(configs);
}
