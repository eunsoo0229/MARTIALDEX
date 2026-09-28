import type { Curriculum } from '../curriculum/types';
import { listMyStyleCurricula } from '../fighterStyle/styleCurriculumService';
import type { MotionEvent, MotionEventCategory, StyleComparisonResult } from './types';

const CATEGORY_KEYWORDS: Record<MotionEventCategory, string[]> = {
  clinch_like: ['clinch', '클린치'],
  level_change_like: ['takedown', '테이크다운', 'double leg', 'single leg', 'level change'],
  strike_like: ['strike', 'jab', 'cross', 'hook', '펀치', '타격'],
  kick_like: ['kick', 'roundhouse', 'teep', '킥', '발차기'],
  footwork_movement: ['footwork', 'distance', '풋워크', '거리'],
  distance_exit_like: ['distance', '거리'],
  guard_hold_like: ['guard', '가드'],
};

export function getLatestStyleCurriculum(): Curriculum | undefined {
  return listMyStyleCurricula()[0];
}

// Deterministic keyword-overlap comparison, not an AI call — the target
// fighter's own real fields (keyTechniques/preferredPositions/offensive
// concepts, already generated in 11단계) are checked against which generic
// motion categories were actually observed in THIS clip. Never compares
// skill level or physical ability — only whether a technical/tactical
// keyword shows up on both sides.
export function compareWithFighterStyle(events: MotionEvent[], styleCurriculum: Curriculum | undefined): StyleComparisonResult | null {
  if (!styleCurriculum?.styleMeta) return null;
  const meta = styleCurriculum.styleMeta;
  const observedCategories = new Set(events.map((e) => e.category));

  const targetPhrases = [...meta.styleAnalysis.keyTechniques, ...meta.styleAnalysis.preferredPositions, ...meta.styleAnalysis.offensiveConcepts];

  const matched: string[] = [];
  const improvementAreas: string[] = [];
  for (const phrase of targetPhrases) {
    const lower = phrase.toLowerCase();
    const entry = (Object.entries(CATEGORY_KEYWORDS) as [MotionEventCategory, string[]][]).find(([, kws]) => kws.some((k) => lower.includes(k)));
    if (!entry) continue;
    const [category] = entry;
    const bucket = observedCategories.has(category) ? matched : improvementAreas;
    if (!bucket.includes(phrase)) bucket.push(phrase);
  }

  return { targetFighterName: meta.fighterName, matchedFeatures: matched.slice(0, 6), improvementAreas: improvementAreas.slice(0, 6) };
}
