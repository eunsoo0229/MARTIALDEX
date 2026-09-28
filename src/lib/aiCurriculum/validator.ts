import type { CurriculumDay } from '../curriculum/types';
import type { GoalTechniqueMatch } from './types';
// Unified resolver (official + shared add_teq + this user's own
// user_techniques) — NOT loadData's official-only getTechnique. The rest of
// this pipeline (curriculumPlanner.ts) already resolves ids this way so a
// technique discovered on the fly for this exact curriculum (via
// discoverMissingDesiredTechniques) still counts as real; using the
// narrower official-only lookup here made every such discovery fail this
// check and get the entire curriculum discarded via VALIDATION_FAILED.
import { resolveTechnique as getTechnique } from '../userTechniques/service';

export interface CurriculumValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Belt-and-suspenders check run right before ANY AI 맞춤 커리큘럼 is saved
 * (spec section 17) — catches exactly the "빈 Day" class of bug that
 * previously showed up in 선수 스타일 커리큘럼 (see
 * fighterStyle/curriculumPlanner.ts's capacity-redistribution comments).
 * planGoalCurriculum() is already designed to never produce these, but this
 * runs independently of that function's internals so a future change to
 * the planner can't silently reintroduce the bug without a test catching it
 * here first.
 */
export function validateCurriculumDays(days: CurriculumDay[], totalDays: number): CurriculumValidationResult {
  const errors: string[] = [];

  if (days.length !== totalDays) {
    errors.push(`Day 수가 일치하지 않습니다 (기대 ${totalDays}, 실제 ${days.length}).`);
  }

  const dayNumbers = new Set(days.map((d) => d.day));
  for (let i = 1; i <= totalDays; i++) {
    if (!dayNumbers.has(i)) errors.push(`Day ${i}가 존재하지 않습니다.`);
  }

  const seenDayNumbers = new Set<number>();
  for (const day of days) {
    if (seenDayNumbers.has(day.day)) errors.push(`Day ${day.day}가 중복됩니다.`);
    seenDayNumbers.add(day.day);

    if (day.learningGoals.length === 0) {
      errors.push(`Day ${day.day}에 학습 목표가 없습니다.`);
    }

    const hasContent = day.techniqueIds.length > 0 || day.reviewTechniqueIds.length > 0;
    if (!hasContent) {
      errors.push(`Day ${day.day}에 기술/훈련 내용이 없습니다 (빈 Day).`);
    }

    for (const techId of [...day.techniqueIds, ...day.reviewTechniqueIds]) {
      if (!getTechnique(techId)) {
        errors.push(`Day ${day.day}가 존재하지 않는 기술 id를 참조합니다: ${techId}`);
      }
    }

    const dupWithinDay = day.techniqueIds.filter((id, i) => day.techniqueIds.indexOf(id) !== i);
    if (dupWithinDay.length > 0) {
      errors.push(`Day ${day.day}에 중복된 기술 참조가 있습니다: ${[...new Set(dupWithinDay)].join(', ')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export interface CurriculumQualityResult {
  ok: boolean;
  /** Fraction of unique NEW-content technique ids (review-only ids excluded — they're reused, not newly taught) whose structureRole is 'primary_technique'. 1 when there's no new content to judge. */
  primaryRatio: number;
  newContentTechniqueCount: number;
}

/**
 * Section 20's quality gate — deliberately separate from
 * validateCurriculumDays (structural integrity: right day count, no empty
 * days, ids resolve) and checkIntentAlignment in service.ts (offense-vs-
 * defense camp). This is the missing check that let the reported bug
 * through: 68 candidates, 0 high/1 medium/67 "낮음(<40)" relevance, and
 * NOTHING stopped the low-relevance 67 from being scheduled as if they were
 * legitimate primary content. Only meaningful (and only enforced) when the
 * goal explicitly requested topic diversity — see structureClassifier.ts's
 * doc comment for why a plain "배우고 싶어" goal must NOT be held to this bar
 * (fundamentals/entries are legitimate majority content there).
 */
export function validateCurriculumQuality(
  days: CurriculumDay[],
  matchesById: Map<string, GoalTechniqueMatch>,
  diversityRequested: boolean
): CurriculumQualityResult {
  const newContentIds = [...new Set(days.flatMap((d) => d.techniqueIds))];
  if (newContentIds.length === 0) return { ok: true, primaryRatio: 1, newContentTechniqueCount: 0 };
  const primaryCount = newContentIds.filter((id) => matchesById.get(id)?.structureRole === 'primary_technique').length;
  const primaryRatio = primaryCount / newContentIds.length;
  // Below this, a "다양성" curriculum has become majority supporting-skill
  // content (grips/positions/stances) rather than the actual technique
  // family breadth the user asked to see — exactly the reported symptom.
  const ok = !diversityRequested || primaryRatio >= 0.6;
  return { ok, primaryRatio, newContentTechniqueCount: newContentIds.length };
}
