import type { Curriculum } from '../curriculum/types';

// Both "선수 스타일" curricula (styleMeta) and "MMA 맞춤 커리큘럼" curricula
// (aiGoalMeta) share the same MMA_MARTIAL_ART_ID pseudo id — this is what
// tells the existing curriculum pages (CurriculumDayList/Detail/TrainingStart)
// which of the two features a given MMA-tagged curriculum actually came
// from, so each keeps linking back to its own real hub.
export function mmaCurriculumLabel(curriculum: Curriculum): string {
  return curriculum.aiGoalMeta ? 'MMA · AI 맞춤 커리큘럼' : 'MMA · 선수 스타일';
}

export function mmaCurriculumLinkTarget(curriculum: Curriculum): string {
  return curriculum.aiGoalMeta ? '/ai-curriculum' : '/fighter-style';
}
