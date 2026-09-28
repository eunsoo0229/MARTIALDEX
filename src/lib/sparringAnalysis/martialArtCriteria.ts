import { STYLE_CURRICULUM_MARTIAL_ART } from '../fighterStyle/styleCurriculumService';
import { getCriteriaLabels } from './sportAnalysisProfiles';

// Data-driven config, not a branching if/else chain — adding a new sparring
// sport later means adding one row here (plus, if it's a real Martialdex
// martial art, nothing else at all since SPARRING_SPORTS below reads off the
// same ids `martialArtSummaries` already uses).
//
// The actual per-sport analysis criteria (allowed technique keywords, motion
// category relevance, scoring weights, result labels) live in ONE place —
// sportAnalysisProfiles.ts — so they aren't duplicated here. This file keeps
// only the UI-facing sport picker list (id/icon/display name) and re-exports
// getCriteriaLabels for existing callers.
export const SPARRING_SPORTS: { id: string; icon: string; nameKo: string }[] = [
  { id: 'boxing', icon: '🥊', nameKo: '복싱' },
  { id: 'kickboxing', icon: '🦵', nameKo: '킥복싱' },
  { id: 'muay-thai', icon: '🇹🇭', nameKo: '무에타이' },
  { id: 'taekwondo', icon: '🥋', nameKo: '태권도' },
  { id: 'karate', icon: '🥋', nameKo: '가라테' },
  { id: 'wrestling', icon: '🤼', nameKo: '레슬링' },
  { id: 'judo', icon: '🥋', nameKo: '유도' },
  { id: 'sambo', icon: '🥋', nameKo: '삼보' },
  { id: 'bjj', icon: '🥋', nameKo: '브라질리언 주짓수(BJJ)' },
  { id: STYLE_CURRICULUM_MARTIAL_ART, icon: '🥊', nameKo: 'MMA' },
];

export { getCriteriaLabels };
