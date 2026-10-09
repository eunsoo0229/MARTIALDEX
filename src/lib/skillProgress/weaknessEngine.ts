import type { Technique } from '../../types';
import type { Curriculum } from '../curriculum/types';
import type { MasteryStatus, SkillProgress } from './types';
import type { CanonicalPosition } from './positionClassifier';
import { martialArtSummaries } from '../loadData';
import { isSyntheticTrainingDomain, splitLegacyTechniques } from '../loadData';
import { getUnifiedAllTechniques } from '../userTechniques/service';
import { buildSkillProgress } from './computeSkillProgress';
import { classifyPosition, POSITION_LABEL } from './positionClassifier';
import { getAllRecords, buildSkillSummaryIndex, getTechniqueSkillSummaryFromIndex } from '../poseAnalysis/recordsService';
import { listTrainingHistory, buildPracticeStatsIndex, getPracticeStatsFromIndex } from '../trainingHistory/service';
import { getAllOverrides } from './overrideStore';


export interface TechniqueSkillEntry {
  technique: Technique;
  progress: SkillProgress;
}

// The one full pass over the unified library (official 1,253/1,283 +
// shared add_teq + this user's own user_techniques — spec [문제 1]'s "나의
// 기술"/숙련도 requirement) — every dashboard/aggregate below takes this
// array in, rather than each re-scanning the whole technique list on its
// own. Reactive callers should get this via useAllSkillProgress()
// (useSkillProgress.ts) so it recomputes whenever pose records / training
// history / overrides / the add_teq cache change.
export function computeAllSkillProgress(): TechniqueSkillEntry[] {
  // Home-training exercises (discovered ones live in add_teq/user_techniques
  // under martialArt === 'home-training' and DO flow through
  // getUnifiedAllTechniques) are excluded here — "무술 기술 숙련도" is a
  // combat-technique concept, and the martial-art dropdown this feeds
  // (MySkills.tsx) only lists the 9 real arts, so a home-training entry
  // would be unfilterable noise. Home-training has its own separate
  // training-record/progress surface (src/lib/homeTraining/).
  //
  // Perf: pose-records / training-history / overrides are each read ONCE
  // here and indexed, then looked up per technique — NOT re-fetched (and
  // the whole localStorage blob re-parsed) once per technique. That N+1
  // pattern (1,283+ full JSON.parse's per call) was the confirmed root
  // cause of multi-second main-thread blocks in the packaged app.
  const recordIndex = buildSkillSummaryIndex(getAllRecords());
  const practiceIndex = buildPracticeStatsIndex(listTrainingHistory());
  const overrides = getAllOverrides();
  return getUnifiedAllTechniques()
    .filter((technique) => !isSyntheticTrainingDomain(technique.martialArt))
    .map((technique) => {
      const summary = getTechniqueSkillSummaryFromIndex(technique.id, recordIndex);
      const practice = getPracticeStatsFromIndex(technique.id, practiceIndex);
      const override = overrides[technique.id] ?? null;
      return { technique, progress: buildSkillProgress(technique.id, summary, practice, override) };
    });
}

/**
 * Old records split by the relation audit ("Lead Teep / Rear Teep") that the
 * user has history / mastery / pose data on. Kept OUT of computeAllSkillProgress
 * (recommendations, AI coach, weakness analysis must never pick an old list
 * record as a technique to practice) — shown only where the user looks at
 * their own records (배운 기술, 나의 기술), marked by technique.splitInto. The
 * data is never copied onto the techniques it was split into.
 */
export function legacySplitSkillEntries(): TechniqueSkillEntry[] {
  const recordIndex = buildSkillSummaryIndex(getAllRecords());
  const practiceIndex = buildPracticeStatsIndex(listTrainingHistory());
  const overrides = getAllOverrides();
  return splitLegacyTechniques()
    .map((technique) => ({
      technique,
      progress: buildSkillProgress(technique.id, getTechniqueSkillSummaryFromIndex(technique.id, recordIndex), getPracticeStatsFromIndex(technique.id, practiceIndex), overrides[technique.id] ?? null),
    }))
    .filter((e) => e.progress.practiceCount > 0 || e.progress.analysisCount > 0 || e.progress.userOverride !== null);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export interface WeaknessEntry {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  score: number | null;
  scoreDelta: number | null;
  practiceCount: number;
  lastPracticedAt: string | null;
  reason: string;
  weaknessScore: number;
}

// 14-7/14-8: ranks techniques the user has ACTUALLY analyzed at least once
// (never invents a score for an un-analyzed technique), weighting low score,
// a declining trend, staleness, and whether the technique is still ahead in
// the user's current curriculum — not score alone.
export function rankWeakness(entries: TechniqueSkillEntry[], options?: { curriculum?: Curriculum; limit?: number }): WeaknessEntry[] {
  const limit = options?.limit ?? 5;
  const curriculumTechniqueIds = new Set<string>();
  if (options?.curriculum) {
    for (const day of options.curriculum.days) for (const id of day.techniqueIds) curriculumTechniqueIds.add(id);
  }

  const ranked: WeaknessEntry[] = [];
  for (const { technique, progress } of entries) {
    if (progress.analysisCount === 0) continue; // no real score to judge — never fabricate one
    if (progress.status === 'proficient') continue;

    const stale = daysSince(progress.lastPracticedAt);
    const scoreComponent = 100 - (progress.latestScore ?? 65);
    const declineComponent = progress.scoreDelta !== null && progress.scoreDelta < 0 ? Math.abs(progress.scoreDelta) * 1.5 : 0;
    const staleComponent = stale !== null && stale > 14 ? Math.min(stale - 14, 30) : 0;
    const curriculumComponent = curriculumTechniqueIds.has(technique.id) ? 15 : 0;
    const weaknessScore = scoreComponent + declineComponent + staleComponent + curriculumComponent;

    const reasonParts: string[] = [];
    if (progress.latestScore !== null) reasonParts.push(`최근 분석 점수 ${progress.latestScore}점`);
    if (declineComponent > 0) reasonParts.push('최근 점수가 하락하는 추세');
    if (staleComponent > 0 && stale !== null) reasonParts.push(`${stale}일간 연습하지 않음`);
    if (curriculumComponent > 0) reasonParts.push('현재 커리큘럼에서 중요한 기술');

    ranked.push({
      techniqueId: technique.id,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      score: progress.latestScore,
      scoreDelta: progress.scoreDelta,
      practiceCount: progress.practiceCount,
      lastPracticedAt: progress.lastPracticedAt,
      reason: reasonParts.length ? reasonParts.join(' · ') : '개선이 필요한 기술입니다.',
      weaknessScore,
    });
  }
  ranked.sort((a, b) => b.weaknessScore - a.weaknessScore);
  return ranked.slice(0, limit);
}

export interface ImprovedEntry {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  latestScore: number | null;
  scoreDelta: number;
}

// "최근 향상된 기술" — requires at least 2 real analyses and a positive
// delta; a technique analyzed only once has no trend to report.
export function findRecentlyImproved(entries: TechniqueSkillEntry[], limit = 5): ImprovedEntry[] {
  const improved: ImprovedEntry[] = [];
  for (const { technique, progress } of entries) {
    if (progress.analysisCount < 2 || progress.scoreDelta === null || progress.scoreDelta <= 0) continue;
    improved.push({
      techniqueId: technique.id,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      latestScore: progress.latestScore,
      scoreDelta: progress.scoreDelta,
    });
  }
  improved.sort((a, b) => b.scoreDelta - a.scoreDelta);
  return improved.slice(0, limit);
}

export type OverallCounts = Record<MasteryStatus, number> & { total: number };

export function summarizeOverallCounts(entries: TechniqueSkillEntry[]): OverallCounts {
  const counts: OverallCounts = { total: 0, not_started: 0, learning: 0, average: 0, proficient: 0, needs_improvement: 0 };
  for (const { progress } of entries) {
    counts.total++;
    counts[progress.status]++;
  }
  return counts;
}

export interface MartialArtBreakdown {
  martialArtId: string;
  nameKo: string;
  total: number;
  counts: Record<MasteryStatus, number>;
}

export function summarizeByMartialArt(entries: TechniqueSkillEntry[]): MartialArtBreakdown[] {
  const map = new Map<string, MartialArtBreakdown>();
  for (const art of martialArtSummaries) {
    map.set(art.id, {
      martialArtId: art.id,
      nameKo: art.nameKo,
      total: 0,
      counts: { not_started: 0, learning: 0, average: 0, proficient: 0, needs_improvement: 0 },
    });
  }
  for (const { technique, progress } of entries) {
    const bucket = map.get(technique.martialArt);
    if (!bucket) continue;
    bucket.total++;
    bucket.counts[progress.status]++;
  }
  return [...map.values()];
}

export interface PositionBreakdown {
  position: CanonicalPosition;
  label: string;
  averageScore: number | null;
  analyzedCount: number;
  totalCount: number;
}

const POSITION_ORDER: Exclude<CanonicalPosition, 'other'>[] = ['standing', 'clinch', 'guard', 'mount_top', 'back_control'];

export function summarizeByPosition(entries: TechniqueSkillEntry[]): PositionBreakdown[] {
  const buckets = new Map<CanonicalPosition, { scores: number[]; total: number }>();
  for (const { technique, progress } of entries) {
    const position = classifyPosition(technique);
    if (position === 'other') continue;
    const bucket = buckets.get(position) ?? { scores: [], total: 0 };
    bucket.total++;
    if (progress.latestScore !== null) bucket.scores.push(progress.latestScore);
    buckets.set(position, bucket);
  }
  return POSITION_ORDER.map((position) => {
    const bucket = buckets.get(position) ?? { scores: [], total: 0 };
    const averageScore = bucket.scores.length ? Math.round(bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length) : null;
    return { position, label: POSITION_LABEL[position], averageScore, analyzedCount: bucket.scores.length, totalCount: bucket.total };
  });
}

export interface CoachStats {
  learnedCount: number;
  proficientCount: number;
  averageCount: number;
  needsImprovementCount: number;
  lastPracticedAt: string | null;
}

export function summarizeCoachStats(entries: TechniqueSkillEntry[]): CoachStats {
  let proficientCount = 0;
  let averageCount = 0;
  let needsImprovementCount = 0;
  let lastPracticedAt: string | null = null;
  for (const { progress } of entries) {
    if (progress.status === 'proficient') proficientCount++;
    else if (progress.status === 'average') averageCount++;
    else if (progress.status === 'needs_improvement') needsImprovementCount++;
    if (progress.lastPracticedAt && (!lastPracticedAt || progress.lastPracticedAt > lastPracticedAt)) {
      lastPracticedAt = progress.lastPracticedAt;
    }
  }
  return {
    learnedCount: proficientCount + averageCount + needsImprovementCount,
    proficientCount,
    averageCount,
    needsImprovementCount,
    lastPracticedAt,
  };
}
