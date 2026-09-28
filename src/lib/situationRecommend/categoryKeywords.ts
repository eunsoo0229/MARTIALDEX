import type { SituationCategory } from './types';

// Data-driven, not a branching if/else chain — each category maps to search
// keywords that build a REAL candidate pool via searchTechniques() (the same
// index the search bar uses), exactly like fighterStyle/techniqueMatcher.ts
// (11단계) and sparringAnalysis/martialArtCriteria.ts (15단계). Adding a new
// situation category later means adding one row here.
export const CATEGORY_KEYWORDS: Record<SituationCategory, string[]> = {
  distance: ['Distance', 'Footwork', '거리', '풋워크', 'Jab', 'Teep', 'Angle'],
  attack: ['Combination', 'Attack', '공격', '콤비네이션', 'Entry', 'Setup', 'Pressure'],
  defense: ['Defense', 'Block', '방어', '블록', 'Parry', 'Head Movement', 'Guard'],
  clinch: ['Clinch', '클린치', 'Underhook', 'Overhook', 'Tie', 'Grip'],
  takedown: ['Takedown', '테이크다운', 'Double Leg', 'Single Leg', 'Sprawl', 'Level Change', 'Throw'],
  ground: ['Ground', 'Mount', 'Side Control', '그라운드', 'Ground and Pound', 'Top Control'],
  guard: ['Guard', '가드', 'Guard Pass', 'Sweep', 'Guard Recovery'],
  escape: ['Escape', '탈출', '이스케이프', 'Bridge', 'Hip Escape'],
  transition: ['Transition', '전환', 'Back Take', 'Scramble'],
  counter: ['Counter', '카운터', 'Counter Attack', 'Sprawl'],
};

export function getCategoryKeywords(category: SituationCategory): string[] {
  return CATEGORY_KEYWORDS[category] ?? [];
}
