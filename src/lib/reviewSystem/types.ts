// 19단계 — AI 기반 복습 및 반복 학습. Candidates are only ever techniques the
// user has ACTUALLY practiced or analyzed before (status !== 'not_started'
// from 14단계 skillProgress) — a technique with zero real history is never
// scheduled for "review" (there is nothing to review).
export type ReviewTier = 'today' | 'soon' | 'maintained';

export const REVIEW_TIER_LABEL: Record<ReviewTier, string> = {
  today: '오늘 복습 추천',
  soon: '곧 복습',
  maintained: '유지 중',
};

export const REVIEW_TIER_ICON: Record<ReviewTier, string> = {
  today: '🔴',
  soon: '🟡',
  maintained: '🟢',
};

export interface ReviewCandidate {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  tier: ReviewTier;
  urgencyScore: number;
  reason: string;
  latestScore: number | null;
  scoreDelta: number | null;
  lastPracticedAt: string | null;
  nextReviewAt: string | null;
  usedInRecentSparring: boolean;
}

export interface ReviewSessionState {
  date: string; // YYYY-MM-DD — a new day always gets a freshly recomputed candidate list
  techniqueIds: string[]; // the actionable ("오늘 복습 추천"/"곧 복습") candidates at the time the session started
  completedTechniqueIds: string[];
  startedAt: string;
  finishedAt: string | null;
}

export interface WeeklyReviewPlan {
  summary: string;
  source: 'ai' | 'fallback';
  generatedAt: string;
}
