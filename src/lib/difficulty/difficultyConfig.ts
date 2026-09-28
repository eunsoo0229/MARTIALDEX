import type { Difficulty } from '../../types';
import difficultyData from '../../../data/curated/difficulty.json';

// Same pattern as posture/postureConfig.ts — a hand/AI-assessed curated
// overlay kept OUTSIDE the step-2 parser's output (data/processed/*.json),
// merged in at load time, so `npm run parse` never overwrites it. Only ever
// fills a technique whose own parsed `difficulty` is null — never
// overrides an already-present value (see loadData.ts's merge call).
const difficulties = difficultyData as unknown as Record<string, Difficulty>;

export function getDifficultyOverride(techniqueId: string): Difficulty | undefined {
  return difficulties[techniqueId];
}
