import type { FighterCandidate } from '../fighterStyle/types';

export interface GenericStylePreset {
  id: string;
  label: string;
  martialArt: string;
  sport: string;
  description: string;
}

// Fast-path for a generic "복싱 중심"/"레슬링 중심"/"BJJ 중심" target that
// isn't a real athlete — fighterIdentification.ts's candidate search is
// explicitly gated on "실제로 존재하며 공개적으로 잘 알려진" people and would
// correctly return zero candidates for these. Everything downstream of
// candidate selection (getOrGenerateStyleAnalysis, matchStyleToTechniques,
// durationAdvisor, curriculumPlanner, styleCurriculumService) only depends
// on the FighterCandidate/FighterStyleAnalysis SHAPE, not on real-athlete-
// ness, so a synthetic candidate here reuses that entire pipeline as-is.
export const GENERIC_STYLE_PRESETS: GenericStylePreset[] = [
  { id: 'my-style__boxing-focus', label: '복싱 중심', martialArt: 'boxing', sport: '복싱', description: '아웃복싱과 잽, 카운터, 풋워크를 중심으로 하는 복싱 중심 스타일' },
  { id: 'my-style__wrestling-focus', label: '레슬링 중심', martialArt: 'wrestling', sport: '레슬링', description: '테이크다운과 탑 컨트롤, 전진 압박을 중심으로 하는 레슬링 중심 스타일' },
  { id: 'my-style__bjj-focus', label: 'BJJ 중심', martialArt: 'bjj', sport: '주짓수', description: '가드 플레이와 서브미션, 포지션 전환을 중심으로 하는 주짓수 중심 스타일' },
];

export function presetToFighterCandidate(preset: GenericStylePreset): FighterCandidate {
  return { id: preset.id, name: `${preset.label} 스타일`, sport: preset.sport, shortDescription: preset.description };
}
