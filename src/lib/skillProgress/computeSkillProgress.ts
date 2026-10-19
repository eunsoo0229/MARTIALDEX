import type { MasteryStatus, SkillProgress } from './types';
import type { TechniqueSkillSummary } from '../poseAnalysis/types';
import { getTechniqueSkillSummary } from '../poseAnalysis/recordsService';
import { getPracticeStatsForTechnique } from '../trainingHistory/service';
import { getOverride } from './overrideStore';
import { coachMastery, getCoachEvidence, type CoachEvidence } from './coachEvidence';

// 14-3 "숙련도는 단순히 AI 자세 분석 점수 하나만 보고 결정하지 않는다" — this
// combines: latest/최근 점수, 점수 추세(scoreDelta), 분석 횟수, 학습(연습)
// 횟수, 그리고 사용자가 직접 지정한 상태(최우선). Every input is real data
// already stored by an existing feature (poseAnalysis records, curriculum
// day completion / 오늘의 훈련 -> trainingHistory) — nothing here invents a
// score or a practice count.
export const REVIEW_INTERVAL_DAYS: Record<MasteryStatus, number | null> = {
  not_started: null,
  learning: 3,
  average: 4,
  proficient: 7,
  needs_improvement: 2,
};

function computeMasteryStatus(analysisCount: number, practiceCount: number, latestScore: number | null, scoreDelta: number | null, coach: MasteryStatus | null): MasteryStatus {
  // No camera measurement: AI 코치 lesson evidence (coachEvidence.ts) decides, else practice → 학습 중.
  if (analysisCount === 0) return coach ?? (practiceCount === 0 ? 'not_started' : 'learning');
  // "Proficient" requires more than one good score in a row (or a stable/
  // improving trend) — a single lucky high score isn't treated as mastery.
  const isProven = analysisCount >= 2 && (scoreDelta ?? 0) >= 0;
  if (latestScore !== null && latestScore >= 80 && isProven) return 'proficient';
  if (latestScore !== null && latestScore >= 60) return 'average';
  if (latestScore !== null && latestScore >= 80) return 'average'; // high but unproven yet
  return 'needs_improvement';
}

/**
 * Pure core shared by computeSkillProgress() (single-technique, fetches its
 * own inputs) and computeAllSkillProgress() (batch — passes in inputs it
 * already read once via the buildXIndex() helpers, instead of every
 * technique re-fetching/re-parsing the full pose-records/training-history
 * blobs from scratch).
 */
export function buildSkillProgress(
  techniqueId: string,
  summary: TechniqueSkillSummary,
  practice: { practiceCount: number; lastPracticedAt: string | null },
  override: MasteryStatus | null,
  coach: CoachEvidence | null = null
): SkillProgress {
  const lastPracticedAt = [summary.lastAnalyzedAt, practice.lastPracticedAt, coach?.lastLessonAt]
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? null;

  const computedStatus = computeMasteryStatus(summary.analysisCount, practice.practiceCount, summary.latestScore, summary.scoreDelta, coachMastery(coach));
  const status = override ?? computedStatus;

  const interval = REVIEW_INTERVAL_DAYS[status];
  const nextReviewAt =
    interval && lastPracticedAt ? new Date(new Date(lastPracticedAt).getTime() + interval * 86400000).toISOString() : null;

  return {
    techniqueId,
    status,
    computedStatus,
    userOverride: override,
    latestScore: summary.latestScore,
    bestScore: summary.bestScore,
    scoreDelta: summary.scoreDelta,
    analysisCount: summary.analysisCount,
    practiceCount: practice.practiceCount,
    coachLessonCount: coach?.lessons ?? 0,
    coachMasteredDays: coach?.masteredDays ?? 0,
    lastPracticedAt,
    lastAnalyzedAt: summary.lastAnalyzedAt,
    nextReviewAt,
  };
}

export function computeSkillProgress(techniqueId: string): SkillProgress {
  const summary = getTechniqueSkillSummary(techniqueId);
  const practice = getPracticeStatsForTechnique(techniqueId);
  const override = getOverride(techniqueId);
  return buildSkillProgress(techniqueId, summary, practice, override, getCoachEvidence(techniqueId));
}
