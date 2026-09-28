import type { SkillStatus } from './types';

// Score-band cutoffs — kept as one place to tune so the "잘함/보통/개선 필요"
// boundaries can change without touching any scoring logic.
export const SCORE_THRESHOLDS = {
  good: 80,
  average: 60,
} as const;

export function classifyScore(score: number): Exclude<SkillStatus, 'not_analyzed'> {
  if (score >= SCORE_THRESHOLDS.good) return 'good';
  if (score >= SCORE_THRESHOLDS.average) return 'average';
  return 'needs_improvement';
}

export const STATUS_LABEL: Record<SkillStatus, string> = {
  good: '잘함',
  average: '보통',
  needs_improvement: '개선 필요',
  not_analyzed: '분석 안 함',
};

export const STATUS_ICON: Record<SkillStatus, string> = {
  good: '🟢',
  average: '🟡',
  needs_improvement: '🔴',
  not_analyzed: '⚪',
};

// Per-metric bar, e.g. "기본 자세 90점 → 잘한 부분". A metric only counts as
// a called-out strength/weakness at the edges — mid-range metrics are just
// shown in the breakdown without an opinion either way.
export function isStrength(score: number): boolean {
  return score >= SCORE_THRESHOLDS.good;
}
export function isImprovementArea(score: number): boolean {
  return score < SCORE_THRESHOLDS.average;
}
