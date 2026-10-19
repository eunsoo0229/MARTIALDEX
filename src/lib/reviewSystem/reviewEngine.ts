import { computeAllSkillProgress, type TechniqueSkillEntry } from '../skillProgress/weaknessEngine';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import { REVIEW_INTERVAL_DAYS } from '../skillProgress/computeSkillProgress';
import { canonicalReviewedIndex, weakTechniques, WEAK_SIGNAL_LABEL } from '../review/sources';
import type { ReviewCandidate, ReviewTier } from './types';

const RECENT_SPARRING_DAYS = 14;
const TODAY_THRESHOLD = 40;
const SOON_THRESHOLD = 10;
const MAX_ACTIONABLE = 8;
const MINUTES_PER_TECHNIQUE = 7;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function recentlyUsedTechniqueIds(): Set<string> {
  const cutoff = Date.now() - RECENT_SPARRING_DAYS * 86400000;
  const ids = new Set<string>();
  for (const s of listSparringSessions()) {
    if (new Date(s.date).getTime() < cutoff) continue;
    for (const g of s.techniqueGuesses) ids.add(g.techniqueId);
  }
  return ids;
}

// Every input is a real, already-computed signal (14단계 숙련도/복습 예정일,
// 15단계 스파링 기록) — the score is a deterministic weighted sum, not a
// learned model, and never invents data for a technique with no history
// (status 'not_started' is skipped entirely below).
export function computeReviewCandidates(entries: TechniqueSkillEntry[] = computeAllSkillProgress()): ReviewCandidate[] {
  const now = new Date();
  const recentSparringIds = recentlyUsedTechniqueIds();
  // A review (review log) resets the schedule just like practice does — but
  // it's read from the review log, never counted as a training session.
  const lastReviewed = canonicalReviewedIndex();
  // Recorded weaknesses (부족 기술 — review checks, AI-coach lessons, own marks).
  const weak = new Map(weakTechniques().map((w) => [w.techniqueId, w]));
  const candidates: ReviewCandidate[] = [];

  for (const { technique, progress } of entries) {
    if (progress.status === 'not_started') continue;

    const interval = REVIEW_INTERVAL_DAYS[progress.status];
    const reviewedAt = lastReviewed.get(technique.id) ?? null;
    const afterReview = interval && reviewedAt ? new Date(Date.parse(reviewedAt) + interval * 86400000).toISOString() : null;
    const nextReviewAt = [progress.nextReviewAt, afterReview].filter((x): x is string => !!x).sort().at(-1) ?? null;
    const daysOverdue = nextReviewAt ? daysBetween(now, new Date(nextReviewAt)) : null;
    const weakness = weak.get(technique.id);
    const usedInRecentSparring = recentSparringIds.has(technique.id);

    let urgencyScore = 0;
    if (daysOverdue !== null) urgencyScore += Math.max(-30, Math.min(60, daysOverdue * 8));
    if (progress.status === 'needs_improvement') urgencyScore += 30;
    else if (progress.status === 'learning') urgencyScore += 15;
    else if (progress.status === 'average') urgencyScore += 10;
    if (progress.scoreDelta !== null && progress.scoreDelta < 0) urgencyScore += Math.min(30, Math.abs(progress.scoreDelta) * 1.2);
    if (usedInRecentSparring) urgencyScore += 15;
    if (weakness && weakness.signal !== 'pose_stale') urgencyScore += weakness.signal === 'review_repeated' ? 35 : weakness.signal === 'user_marked' ? 20 : 25;

    const tier: ReviewTier = urgencyScore >= TODAY_THRESHOLD ? 'today' : urgencyScore >= SOON_THRESHOLD ? 'soon' : 'maintained';

    const reasonParts: string[] = [];
    if (daysOverdue !== null && daysOverdue >= 0) reasonParts.push(daysOverdue === 0 ? '오늘이 복습 예정일입니다' : `복습 예정일이 ${daysOverdue}일 지났습니다`);
    else if (daysOverdue !== null) reasonParts.push(`${Math.abs(daysOverdue)}일 후 복습 예정`);
    if (progress.status === 'needs_improvement') reasonParts.push('최근 분석 점수가 개선이 필요한 수준입니다');
    if (progress.scoreDelta !== null && progress.scoreDelta < 0) reasonParts.push('최근 점수가 하락하는 추세입니다');
    if (usedInRecentSparring) reasonParts.push('최근 스파링에서 사용이 관찰되었습니다');
    if (weakness && weakness.signal !== 'pose_stale') reasonParts.push(WEAK_SIGNAL_LABEL[weakness.signal]);
    if (reviewedAt) reasonParts.push(`마지막 복습 ${reviewedAt.slice(0, 10)}`);
    if (reasonParts.length === 0) reasonParts.push('꾸준히 유지되고 있습니다');

    candidates.push({
      techniqueId: technique.id,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      tier,
      urgencyScore,
      reason: reasonParts.join(' · '),
      latestScore: progress.latestScore,
      scoreDelta: progress.scoreDelta,
      lastPracticedAt: progress.lastPracticedAt,
      nextReviewAt,
      usedInRecentSparring,
    });
  }

  candidates.sort((a, b) => b.urgencyScore - a.urgencyScore);
  return candidates;
}

export interface TodayReviewPlan {
  actionable: ReviewCandidate[]; // 'today' + 'soon' tiers, capped
  maintained: ReviewCandidate[]; // 'maintained' tier — shown separately, not part of the walkthrough
  estimatedMinutes: number;
}

export function buildTodayReviewPlan(candidates: ReviewCandidate[] = computeReviewCandidates()): TodayReviewPlan {
  const actionable = candidates.filter((c) => c.tier !== 'maintained').slice(0, MAX_ACTIONABLE);
  const maintained = candidates.filter((c) => c.tier === 'maintained');
  return { actionable, maintained, estimatedMinutes: actionable.length * MINUTES_PER_TECHNIQUE };
}
