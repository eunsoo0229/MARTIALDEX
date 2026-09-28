// 17단계 — 상황별 AI 기술 추천. Every recommended technique is validated
// against a real, deterministically-built candidate pool (candidatePool.ts)
// before it can ever reach the UI — see recommendationService.ts.
export type SituationCategory = 'distance' | 'attack' | 'defense' | 'clinch' | 'takedown' | 'ground' | 'guard' | 'escape' | 'transition' | 'counter';

export const SITUATION_CATEGORY_ORDER: SituationCategory[] = [
  'distance',
  'attack',
  'defense',
  'clinch',
  'takedown',
  'ground',
  'guard',
  'escape',
  'transition',
  'counter',
];

export const SITUATION_CATEGORY_LABEL: Record<SituationCategory, string> = {
  distance: '거리',
  attack: '공격',
  defense: '방어',
  clinch: '클린치',
  takedown: '테이크다운',
  ground: '그라운드',
  guard: '가드',
  escape: '탈출',
  transition: '전환',
  counter: '카운터',
};

export const SITUATION_EXAMPLES = [
  '상대가 계속 앞으로 압박해.',
  '상대가 테이크다운을 시도해.',
  '클린치 상황에서 뭘 해야 해?',
  '상대가 가드를 잘 지켜.',
  '복싱 거리에서 계속 맞아.',
  '상대가 나보다 키가 커.',
];

/** Whether this technique was prioritized *because* the user hasn't mastered it yet (spec 4). */
export type RecommendationPriority = 'learning_fit' | 'general';

export interface SituationTechniqueRecommendation {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  reason: string;
  priority: RecommendationPriority;
}

export interface SituationRecommendationResult {
  situationText: string;
  category: SituationCategory | null;
  martialArt: string;
  recommendations: SituationTechniqueRecommendation[];
  source: 'ai' | 'fallback';
  generatedAt: string;
}
