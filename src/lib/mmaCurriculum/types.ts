import { STYLE_CURRICULUM_MARTIAL_ART } from '../fighterStyle/styleCurriculumService';

// "MMA 맞춤 커리큘럼" reuses the SAME synthetic martial-art id the
// "선수 스타일 학습" system already established (STYLE_CURRICULUM_MARTIAL_ART
// = 'mma') rather than inventing a second pseudo-id — every existing screen
// that already special-cases that id (CurriculumDayList/Detail/TrainingStart)
// keeps working, and a curriculum's `aiGoalMeta` vs `styleMeta` field is what
// tells the two MMA-tagged features apart (see those pages' updated labels).
export const MMA_MARTIAL_ART_ID = STYLE_CURRICULUM_MARTIAL_ART;

// The real Martialdex martial arts MMA training legitimately draws from
// (spec's own mapping: 복싱→타격, 킥복싱/무에타이→킥/클린치, 레슬링→테이크다운
// /테이크다운 방어, 주짓수→그라운드/서브미션, 유도/삼보→테이크다운/클린치).
// 가라테/태권도 are deliberately excluded — not part of the spec's mapping,
// and keeping the pool to arts with genuine MMA carryover avoids diluting
// matches with techniques that don't actually transfer.
export const MMA_SOURCE_MARTIAL_ARTS = ['boxing', 'kickboxing', 'muay-thai', 'wrestling', 'judo', 'sambo', 'bjj'];

// Every area here is backed by REAL technique vocabulary already present in
// the encyclopedia (verified against data/processed/*.json before adding —
// e.g. "Sprawl", "Underhook Entry", "Double-Leg Down Defense" for
// takedown_defense). "Cage" is deliberately NOT a technique-classification
// bucket — there is no real cage-specific technique data in Martialdex, so
// classifyMmaArea() never claims one; cage context is only ever discussed in
// AI narration relative to clinch/takedown content that genuinely exists.
export type MmaArea = 'striking' | 'clinch' | 'takedown' | 'takedown_defense' | 'ground' | 'submission' | 'ground_and_pound' | 'transition';

export const MMA_AREA_LABEL: Record<MmaArea, string> = {
  striking: 'Striking (타격)',
  clinch: 'Clinch (클린치)',
  takedown: 'Takedown (테이크다운)',
  takedown_defense: 'Takedown Defense (테이크다운 방어)',
  ground: 'Ground (그라운드)',
  submission: 'Submission (서브미션)',
  ground_and_pound: 'Ground & Pound (그라운드 앤 파운드)',
  transition: 'Transition (전환)',
};
