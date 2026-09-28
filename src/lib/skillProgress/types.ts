// 14단계 — 5-state mastery, distinct from poseAnalysis's 4-state SkillStatus
// ('good'|'average'|'needs_improvement'|'not_analyzed'). This layer sits ON
// TOP of that (and of trainingHistory) to also cover techniques that have
// never been camera-analyzed but the user has practiced via a curriculum —
// something the pose-only status can't express.
export type MasteryStatus = 'not_started' | 'learning' | 'average' | 'proficient' | 'needs_improvement';

export const MASTERY_ORDER: MasteryStatus[] = ['proficient', 'average', 'learning', 'needs_improvement', 'not_started'];

export const MASTERY_ICON: Record<MasteryStatus, string> = {
  not_started: '⚪',
  learning: '🔵',
  average: '🟡',
  proficient: '🟢',
  needs_improvement: '🔴',
};

export const MASTERY_LABEL: Record<MasteryStatus, string> = {
  not_started: '미학습',
  learning: '학습 중',
  average: '보통',
  proficient: '숙련',
  needs_improvement: '개선 필요',
};

export interface SkillProgress {
  techniqueId: string;
  status: MasteryStatus; // userOverride if set, else computedStatus
  computedStatus: MasteryStatus;
  userOverride: MasteryStatus | null;
  latestScore: number | null;
  bestScore: number | null;
  scoreDelta: number | null;
  analysisCount: number;
  practiceCount: number;
  lastPracticedAt: string | null;
  lastAnalyzedAt: string | null;
  nextReviewAt: string | null;
}
