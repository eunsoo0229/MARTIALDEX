import type { CurriculumDay, ExerciseConfig } from '../curriculum/types';
import type { HomeExerciseMatch } from './types';
import { resolveTechnique } from '../userTechniques/service';

// A home-training curriculum is a WORKOUT SPLIT (repeated practice across a
// fixed weekly cadence), not a teaching sequence introducing new content
// each day like aiCurriculum/curriculumPlanner.ts — so it deliberately does
// NOT reuse that phase-weighted (fundamentals→entries→position→connection)
// scheduler, which exists specifically to sequence NEW technique
// instruction. `CurriculumDay.day` here means "session N", not "week N" —
// homeTrainingMeta (types.ts) carries the real sessionsPerWeek/totalWeeks
// so the UI can label sessions correctly; the generic `estimatedWeeks`
// field on Curriculum is left untouched (see curriculumService.ts's own
// Math.ceil(days.length / 4) — never repurposed for this feature).

const MIN_EXERCISES_PER_SESSION = 3;
const MAX_EXERCISES_PER_SESSION = 6;

function exercisesPerSessionForMinutes(minutesPerSession: number): number {
  if (minutesPerSession <= 20) return MIN_EXERCISES_PER_SESSION;
  if (minutesPerSession <= 45) return 4;
  return MAX_EXERCISES_PER_SESSION;
}

export interface PlanHomeSessionsParams {
  subjectLabel: string;
  matches: HomeExerciseMatch[];
  sessionsPerWeek: number;
  totalWeeks: number;
  minutesPerSession: number;
}

export interface PlannedHomeSessions {
  days: CurriculumDay[];
}

/**
 * Deterministic session-by-session scheduler. Cycles a sliding window
 * through the matched pool (type-interleaved, then relevance-ordered within
 * each type) so different sessions get different exercise combinations —
 * covering the whole pool before repeating — while every session naturally
 * gets type variety instead of e.g. an all-strength session, since
 * consecutive pool entries alternate exerciseType. ALWAYS emits an explicit
 * exerciseConfig per exercise (never relies on todayTraining/
 * exerciseDefaults.ts's generic inference, which isn't tuned for
 * home-training exercises) — pulled straight from each exercise's own
 * recommendedSets/recommendedReps/recommendedDurationSeconds/recommendedRestSeconds.
 */
export function planHomeSessions(params: PlanHomeSessionsParams): PlannedHomeSessions {
  const { subjectLabel, matches, sessionsPerWeek, totalWeeks, minutesPerSession } = params;
  const totalSessions = Math.max(1, Math.min(180, sessionsPerWeek * totalWeeks));
  const perSession = exercisesPerSessionForMinutes(minutesPerSession);

  const rawPool = matches
    .map((m) => ({ match: m, technique: resolveTechnique(m.exerciseId) }))
    .filter((x): x is { match: HomeExerciseMatch; technique: NonNullable<ReturnType<typeof resolveTechnique>> } => !!x.technique);

  const days: CurriculumDay[] = [];
  if (rawPool.length === 0) return { days };

  // Pre-interleave by exerciseType (round-robin merge of same-relevance-
  // ordered type buckets) so a plain non-skipping sliding window naturally
  // gets type variety within each session, and the window steadily advances
  // through the WHOLE pool before repeating. A skip-based "walk forward
  // until MAX_SAME_TYPE_PER_SESSION is satisfied" approach (tried first)
  // inflated the pool pointer unevenly session-to-session and collapsed
  // into a short repeating cycle long before the pool was exhausted — this
  // replaces that bug.
  const byType = new Map<string, typeof rawPool>();
  for (const item of rawPool) {
    const key = item.technique.exerciseType ?? 'unspecified';
    const bucket = byType.get(key) ?? [];
    bucket.push(item);
    byType.set(key, bucket);
  }
  const typeBuckets = [...byType.values()];
  const pool: typeof rawPool = [];
  for (let i = 0; pool.length < rawPool.length; i++) {
    for (const bucket of typeBuckets) if (bucket[i]) pool.push(bucket[i]);
  }

  let poolIdx = 0;
  for (let session = 1; session <= totalSessions; session++) {
    const chosen: typeof pool = [];
    let scanned = 0;
    while (chosen.length < perSession && scanned < pool.length) {
      const candidate = pool[(poolIdx + scanned) % pool.length];
      scanned++;
      if (chosen.some((c) => c.technique.id === candidate.technique.id)) continue;
      chosen.push(candidate);
    }
    poolIdx += perSession;
    if (chosen.length === 0) continue; // pool truly exhausted — never emit a blank session

    const exerciseConfig: Record<string, ExerciseConfig> = {};
    for (const { technique } of chosen) {
      const isTimeBased = technique.recommendedDurationSeconds !== null && technique.recommendedDurationSeconds !== undefined;
      exerciseConfig[technique.id] = {
        mode: isTimeBased ? 'time' : 'reps',
        sets: technique.recommendedSets ?? 3,
        targetReps: isTimeBased ? null : (technique.recommendedReps ?? 12),
        targetSeconds: isTimeBased ? (technique.recommendedDurationSeconds ?? 30) : null,
        restSeconds: technique.recommendedRestSeconds ?? 45,
      };
    }

    days.push({
      day: session,
      title: `${session}회차 · ${chosen.map((c) => c.technique.name).join(' · ')}`,
      description: `'${subjectLabel}' 목표를 위한 ${session}번째 홈트 세션입니다. ${chosen.map((c) => c.technique.name).join(', ')}을(를) 진행합니다.`,
      learningGoals: chosen.map((c) => `${c.technique.name}${c.technique.purpose ? ` — ${c.technique.purpose}` : ''}`),
      techniqueIds: chosen.map((c) => c.technique.id),
      reviewTechniqueIds: [],
      difficulty: chosen[0]?.technique.difficulty ?? null,
      estimatedMinutes: minutesPerSession,
      exerciseConfig,
    });
  }

  return { days };
}
