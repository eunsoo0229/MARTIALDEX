import type { Technique } from '../../types';
import type { CurriculumDay, ExerciseConfig } from '../curriculum/types';

// Martial-art-specific "오늘의 훈련" defaults — inferred at runtime from a
// technique's own name/category/tags (already present in the 1253-technique
// dataset), never by adding new exercise content to data/processed/*.json.
// Any curriculum author can override a technique's config explicitly via
// CurriculumDay.exerciseConfig; this is only the fallback for the ones who
// haven't (i.e. every curriculum that existed before this feature).

const TIME_BASED_HINTS = [
  'shadow',
  '쉐도우',
  '섀도',
  'retention',
  '리텐션',
  '유지',
  'hold',
  '홀드',
  'sparring',
  '스파링',
  'plank',
  '플랭크',
  'guard control',
  '포지션 유지',
];

function isTimeBased(technique: Technique): boolean {
  const haystack = `${technique.name} ${technique.koreanName ?? ''} ${technique.category} ${technique.tags.join(' ')}`.toLowerCase();
  return TIME_BASED_HINTS.some((hint) => haystack.includes(hint));
}

const GRAPPLING_ARTS = new Set(['bjj', 'wrestling', 'judo', 'sambo']);

/** A reasonable default when a curriculum author hasn't configured this technique explicitly. */
export function getDefaultExerciseConfig(technique: Technique): ExerciseConfig {
  // Home-training exercises carry their OWN recommended config (see
  // src/lib/homeTraining/library.ts and recordGenerator.ts) — homeTraining's
  // own sessionPlanner.ts always writes an explicit exerciseConfig so this
  // branch is only reached via FreeTraining.tsx's "add without a Day"
  // path, where using the exercise's own real recommendation is far more
  // accurate than the generic striking/grappling heuristics below (which
  // don't apply to a Squat or a stretch at all).
  if (technique.recommendedSets !== undefined || technique.recommendedReps !== undefined || technique.recommendedDurationSeconds !== undefined) {
    const isTimeBasedExercise = technique.recommendedDurationSeconds !== null && technique.recommendedDurationSeconds !== undefined;
    return {
      mode: isTimeBasedExercise ? 'time' : 'reps',
      sets: technique.recommendedSets ?? 3,
      targetReps: isTimeBasedExercise ? null : (technique.recommendedReps ?? 12),
      targetSeconds: isTimeBasedExercise ? (technique.recommendedDurationSeconds ?? 30) : null,
      restSeconds: technique.recommendedRestSeconds ?? 45,
    };
  }
  if (isTimeBased(technique)) {
    return { mode: 'time', sets: 3, targetReps: null, targetSeconds: 60, restSeconds: 30 };
  }
  if (GRAPPLING_ARTS.has(technique.martialArt)) {
    // Grappling drills/reps: fewer, more rest between sets.
    return { mode: 'reps', sets: 3, targetReps: 10, targetSeconds: null, restSeconds: 60 };
  }
  // Striking arts (boxing/kickboxing/muay thai/etc.) and everything else: higher-rep combos, shorter rest.
  return { mode: 'reps', sets: 3, targetReps: 15, targetSeconds: null, restSeconds: 45 };
}

export function resolveExerciseConfig(day: CurriculumDay | null | undefined, technique: Technique): ExerciseConfig {
  return day?.exerciseConfig?.[technique.id] ?? getDefaultExerciseConfig(technique);
}
