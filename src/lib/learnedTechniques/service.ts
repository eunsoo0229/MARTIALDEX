import type { SkillProgress } from '../skillProgress/types';
import { canonicalTechniqueId } from '../techniqueCanonical';
import type { TechniqueSkillEntry } from '../skillProgress/weaknessEngine';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';
import { listTrainingHistory } from '../trainingHistory/service';

// "배운 기술" = every technique the user has EVER studied, whatever its
// current mastery. Built only from data the app already stores:
//   - any training_history entry that includes the technique (completed or
//     stopped early — both mean it was actually practiced),
//   - any camera pose-analysis record (analysisCount > 0),
//   - any finished AI 코치 lesson on it (coachLessonCount > 0),
//   - a user-set mastery override other than '미학습' (the user telling us
//     they know it).
// A later override back to '미학습' never erases real history, so a
// technique once practiced stays in this list — the spec's "현재 숙련도와
// 관계없이 한 번이라도 학습한 기술".

export function practicedTechniqueIdSet(): Set<string> {
  const ids = new Set<string>();
  for (const e of listTrainingHistory()) for (const id of e.techniqueIds) ids.add(canonicalTechniqueId(id));
  return ids;
}

export function isEverLearned(progress: SkillProgress, practiced: Set<string>): boolean {
  return practiced.has(progress.techniqueId) || progress.analysisCount > 0 || progress.coachLessonCount > 0 || (progress.userOverride !== null && progress.userOverride !== 'not_started');
}

/** Learned entries, most recently practiced first (never-dated ones last, by name). */
export function listLearnedTechniques(entries: TechniqueSkillEntry[] = computeAllSkillProgress()): TechniqueSkillEntry[] {
  const practiced = practicedTechniqueIdSet();
  return entries
    .filter((e) => isEverLearned(e.progress, practiced))
    .sort((a, b) => (b.progress.lastPracticedAt ?? '').localeCompare(a.progress.lastPracticedAt ?? '') || a.technique.name.localeCompare(b.technique.name));
}

export type LearnedBasis = 'practice' | 'pose' | 'coach' | 'self';
export const LEARNED_BASIS_LABEL: Record<LearnedBasis, string> = { practice: '연습 기록 있음', pose: '자세 분석 기록 있음', coach: 'AI 코치 수업 기록 있음', self: '직접 지정만 (기록 없음)' };

/** Why a technique counts as learned — the "학습 상태" shown and filtered on 배운 기술. */
export function learnedBasis(progress: SkillProgress, practiced: Set<string>): LearnedBasis[] {
  const out: LearnedBasis[] = [];
  if (practiced.has(progress.techniqueId)) out.push('practice');
  if (progress.analysisCount > 0) out.push('pose');
  if (progress.coachLessonCount > 0) out.push('coach');
  if (out.length === 0) out.push('self');
  return out;
}
