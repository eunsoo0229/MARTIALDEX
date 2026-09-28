import type { MartialArtFile, Technique } from '../../types';
import { GYM_MARTIAL_ART_ID, GYM_EXERCISES_RAW } from './exercisesRaw';

// A hand-derived, curated library — NOT part of the data/processed/*.json glob
// (see scripts/parse-techniques.mjs), so it never appears in
// `allTechniques`/`martialArtSummaries` (loadData.ts wires it in separately,
// same pattern as homeTraining/library.ts). Source: 147 real gym exercise
// entries (gym_exercises_markdown.zip, 14 body-part folders) — honestly 147,
// not 300+. Only the structured frontmatter (name/body part/muscles/
// equipment/difficulty/type) is imported; the source markdown's prose
// sections (설명/수행 방법/주의사항) were verified programmatically to be
// templated boilerplate shared across the whole dataset (identical text
// keyed only by 운동 유형), not real exercise-specific instruction, so they
// are deliberately NOT imported. `description` below is instead a short,
// honest sentence derived only from real structured fields (body part +
// exercise type) — never presented as verified per-exercise guidance.
// `posture` is left undefined entirely (same "no fabricated content" rule
// CuratedVideo/posture.json already follow for official techniques).
export { GYM_MARTIAL_ART_ID };

const GYM_MARTIAL_ART_META = { id: GYM_MARTIAL_ART_ID, nameEn: 'Gym Training', nameKo: '웨이트' };

function describeExercise(bodyPartLabel: string, kind: Technique['gymExerciseKind']): string {
  return `${bodyPartLabel} 부위를 대상으로 하는 ${kind} 운동입니다.`;
}

// The ONLY 3 cases among these 147 where the input weight isn't simply the
// load lifted — narrow and name/equipment-driven, not a blanket "맨몸 =
// bodyweight" rule (a crunch or plank isn't "100% bodyweight lifted" the way
// a pull-up is, and there's no validated fraction for partial-bodyweight
// moves like push-ups, so those are deliberately left at 'standard' rather
// than inventing a percentage — see GymWeightCalcType's own doc comment).
const BODYWEIGHT_EXERCISE_NAMES = new Set(['풀업', '친업', '딥스']);

function deriveWeightCalcType(name: string, equipment: string[]): Technique['gymWeightCalcType'] {
  if (equipment.includes('덤벨')) return 'dumbbell';
  if (name.includes('어시스트')) return 'assisted_machine';
  if (BODYWEIGHT_EXERCISE_NAMES.has(name) && equipment.length === 1 && equipment[0] === '맨몸') return 'bodyweight';
  return undefined;
}

const GYM_BODY_PART_KOREAN_LABEL: Record<string, string> = {
  chest: '가슴',
  back: '등',
  shoulders: '어깨',
  biceps: '이두',
  triceps: '삼두',
  forearms: '전완',
  abs: '복근',
  glutes: '둔근',
  quads: '대퇴사두근',
  hamstrings: '햄스트링',
  calves: '종아리',
  lower_back: '허리',
  cardio: '유산소',
  full_body: '전신',
};

const exercises: Technique[] = GYM_EXERCISES_RAW.map((raw) => ({
  id: raw.id,
  martialArt: GYM_MARTIAL_ART_ID,
  name: raw.name,
  koreanName: raw.name,
  aliases: [],
  category: GYM_BODY_PART_KOREAN_LABEL[raw.gymBodyPart] ?? raw.gymBodyPart,
  positions: [],
  description: describeExercise(GYM_BODY_PART_KOREAN_LABEL[raw.gymBodyPart] ?? raw.gymBodyPart, raw.gymExerciseKind),
  purpose: null,
  principles: [],
  variations: [],
  counters: [],
  defenses: [],
  transitions: [],
  relatedTechniques: [],
  relatedMartialArts: [],
  difficulty: raw.gymDifficulty === '초급' ? 'beginner' : raw.gymDifficulty === '중급' ? 'intermediate' : 'advanced',
  tags: [...raw.secondaryMuscles, ...raw.gymEquipment, '웨이트', raw.primaryMuscle],
  youtubeSearchQuery: `${raw.name} 운동 방법`,
  videos: [],
  gymBodyPart: raw.gymBodyPart,
  primaryMuscle: raw.primaryMuscle,
  secondaryMuscles: raw.secondaryMuscles,
  gymEquipment: raw.gymEquipment,
  gymDifficulty: raw.gymDifficulty,
  gymExerciseKind: raw.gymExerciseKind,
  gymWeightCalcType: deriveWeightCalcType(raw.name, raw.gymEquipment),
  recommendedSets: raw.recommendedSets,
  recommendedReps: raw.recommendedReps,
  recommendedDurationSeconds: raw.recommendedDurationSeconds,
  recommendedRestSeconds: raw.recommendedRestSeconds,
}));

export const GYM_TRAINING_FILE: MartialArtFile = {
  martialArt: GYM_MARTIAL_ART_META,
  count: exercises.length,
  techniques: exercises,
};
