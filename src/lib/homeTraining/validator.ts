import type { CurriculumDay } from '../curriculum/types';
import { resolveTechnique } from '../userTechniques/service';

export interface HomeCurriculumValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Mirrors aiCurriculum/validator.ts's validateCurriculumDays (same
 * empty-Day/dangling-id/duplicate checks) plus one home-training-specific
 * rule: every techniqueId in a session MUST have an exerciseConfig entry —
 * sessionPlanner.ts always emits one, so a missing entry here means a bug
 * upstream, not something to silently paper over with exerciseDefaults.ts's
 * generic (and, for exercises, inaccurate) fallback inference.
 */
export function validateHomeSessions(days: CurriculumDay[], totalSessions: number): HomeCurriculumValidationResult {
  const errors: string[] = [];

  if (days.length !== totalSessions) {
    errors.push(`세션 수가 일치하지 않습니다 (기대 ${totalSessions}, 실제 ${days.length}).`);
  }

  const seenDayNumbers = new Set<number>();
  for (const day of days) {
    if (seenDayNumbers.has(day.day)) errors.push(`${day.day}회차가 중복됩니다.`);
    seenDayNumbers.add(day.day);

    if (day.techniqueIds.length === 0) {
      errors.push(`${day.day}회차에 운동이 없습니다 (빈 세션).`);
    }

    for (const id of day.techniqueIds) {
      if (!resolveTechnique(id)) {
        errors.push(`${day.day}회차가 존재하지 않는 운동 id를 참조합니다: ${id}`);
      }
      if (!day.exerciseConfig?.[id]) {
        errors.push(`${day.day}회차의 운동(${id})에 세트/횟수/휴식 설정이 없습니다.`);
      }
    }

    const dupWithinDay = day.techniqueIds.filter((id, i) => day.techniqueIds.indexOf(id) !== i);
    if (dupWithinDay.length > 0) {
      errors.push(`${day.day}회차에 중복된 운동 참조가 있습니다: ${[...new Set(dupWithinDay)].join(', ')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
