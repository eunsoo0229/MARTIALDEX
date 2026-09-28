// Mirrors homeTrainingDiscovery/recordGenerator.ts, but generates a gym/
// weight-training exercise record (gymBodyPart/primaryMuscle/
// secondaryMuscles/gymEquipment/gymDifficulty/gymExerciseKind) instead of a
// home-training one. Kept as a fully separate file so neither existing
// discovery flow is ever at risk from this feature's changes.
import type { GymBodyPart, GymDifficulty, GymExerciseKind, GymWeightCalcType, Technique } from '../../types';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { GYM_MARTIAL_ART_ID } from '../gymTraining/library';
import { GYM_BODY_PART_LABEL } from '../gymTraining/recovery';

const VALID_DIFFICULTIES: GymDifficulty[] = ['초급', '중급', '고급'];
const VALID_KINDS: GymExerciseKind[] = ['단일', '등척성', '복합', '유산소'];
const VALID_WEIGHT_CALC_TYPES: GymWeightCalcType[] = ['standard', 'dumbbell', 'assisted_machine', 'bodyweight'];

// Reverse of GYM_BODY_PART_LABEL (recovery.ts) — same 14-value taxonomy the
// static 147-exercise bundle already uses, so a newly-discovered exercise
// slots into the exact same recovery/volume attribution with no special-casing.
const LABEL_TO_BODY_PART: Record<string, GymBodyPart> = Object.fromEntries(
  Object.entries(GYM_BODY_PART_LABEL).map(([id, label]) => [label, id as GymBodyPart])
);

interface RawGeneratedGymExercise {
  gymBodyPart: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  gymEquipment: string[];
  gymDifficulty: string;
  gymExerciseKind: string;
  weightCalcType: string;
  description: string;
  postureNotes: string | null;
  recommendedSets: number | null;
  recommendedReps: number | null;
  recommendedDurationSeconds: number | null;
  recommendedRestSeconds: number | null;
}

function isRawGeneratedGymExercise(data: unknown): data is RawGeneratedGymExercise {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.gymBodyPart === 'string' &&
    d.gymBodyPart in LABEL_TO_BODY_PART &&
    typeof d.primaryMuscle === 'string' &&
    Array.isArray(d.secondaryMuscles) &&
    Array.isArray(d.gymEquipment) &&
    typeof d.gymDifficulty === 'string' &&
    VALID_DIFFICULTIES.includes(d.gymDifficulty as GymDifficulty) &&
    typeof d.gymExerciseKind === 'string' &&
    VALID_KINDS.includes(d.gymExerciseKind as GymExerciseKind) &&
    typeof d.weightCalcType === 'string' &&
    VALID_WEIGHT_CALC_TYPES.includes(d.weightCalcType as GymWeightCalcType) &&
    typeof d.description === 'string' &&
    (d.postureNotes === null || typeof d.postureNotes === 'string')
  );
}

export interface GeneratedGymExerciseRecord {
  technique: Technique;
}

/**
 * Generates the full exercise record in the SAME Technique shape every
 * other technique/exercise uses. `martialArt` is hardcoded to
 * GYM_MARTIAL_ART_ID — no "confirmed martial art" override path, so the AI
 * can never re-file this under a real combat martial art. `description`
 * here is real AI-generated (verified) prose, unlike the static 147-bundle's
 * templated placeholder text (see gymTraining/library.ts's header comment)
 * — this is a genuinely new, per-exercise description, not boilerplate.
 */
export async function generateGymExerciseRecord(input: {
  id: string;
  name: string;
  description?: string;
  verifiedCategory: string | null;
}): Promise<{ ok: true; record: GeneratedGymExerciseRecord } | { ok: false; message: string }> {
  const systemInstruction = [
    '검증이 완료된 새 헬스/웨이트 트레이닝 운동의 상세 정보를 Martialdex의 기존 운동 데이터 형식에 맞춰 작성한다.',
    '확실하지 않은 세부사항을 사실인 것처럼 지어내지 않는다 — 일반적으로 알려진 정보만 작성한다.',
    '',
    `gymBodyPart는 다음 14개 한국어 라벨 중 정확히 하나: ${Object.values(GYM_BODY_PART_LABEL).join(', ')}`,
    'primaryMuscle은 이 운동이 대상으로 하는 주요 근육 이름(한국어, 예: "대흉근").',
    'secondaryMuscles는 함께 쓰이는 보조 근육 이름 배열(한국어, 확신 없으면 빈 배열).',
    'gymEquipment는 이 운동에 필요한 장비 목록(한국어, 예: ["바벨"], 맨몸이면 ["맨몸"]).',
    `gymDifficulty는 다음 중 하나: ${VALID_DIFFICULTIES.join(', ')}.`,
    `gymExerciseKind는 다음 중 하나: ${VALID_KINDS.join(', ')} (단일=한 관절만 사용, 복합=여러 관절/근육 사용, 등척성=정적 유지, 유산소=심폐 지구력 운동).`,
    `weightCalcType은 사용자가 입력하는 중량이 실제 부하로 이어지는 방식이며 다음 중 하나:`,
    '- standard: 바벨/머신/케이블/원판 등 입력한 중량이 곧 실제로 드는 무게인 경우 (가장 일반적).',
    '- dumbbell: 양손에 각각 덤벨을 드는 운동이라 사용자가 입력하는 값이 "한쪽 덤벨"의 무게이고, 실제 부하는 그 2배인 경우.',
    '- assisted_machine: 어시스트(보조) 머신처럼 입력값이 "보조 무게"이고, 실제 부하는 체중에서 보조 무게를 뺀 값인 경우 (예: 어시스트 풀업/딥스 머신).',
    '- bodyweight: 풀업/친업/딥스처럼 별도 중량 입력 없이 체중 자체가 부하가 되는 순수 맨몸 복합 운동인 경우 (팔굽혀펴기처럼 체중의 일부만 싣는 운동은 정확한 비율을 알 수 없으므로 standard로 분류).',
    '확신이 없으면 standard로 답한다.',
    'description은 운동에 대한 객관적인 설명 2~3문장(수행 방법이 아니라 무엇을 대상으로 하는 운동인지 설명).',
    'postureNotes는 이 운동을 올바르게 수행하는 방법(자세/동작 순서/흔한 실수) 2~4문장 — description과 달리 실제 수행 방법을 다룬다. 검증된 일반적인 정보만 작성하고, 확신이 없으면 반드시 null로 답한다(지어내지 않는다).',
    'recommendedSets/recommendedReps/recommendedDurationSeconds/recommendedRestSeconds는 일반적으로 권장되는 기본값(숫자, 확신 없으면 null) —',
    '유산소/시간 기반 운동은 recommendedReps를 null로, recommendedDurationSeconds를 채운다. 그 외는 반대로 한다.',
    '',
    '출력 형식: {"gymBodyPart": string, "primaryMuscle": string, "secondaryMuscles": string[], "gymEquipment": string[],',
    '"gymDifficulty": string, "gymExerciseKind": string, "weightCalcType": string, "description": string, "postureNotes": string|null,',
    '"recommendedSets": number|null, "recommendedReps": number|null, "recommendedDurationSeconds": number|null, "recommendedRestSeconds": number|null}',
  ].join('\n');

  const question = `운동명: "${input.name}" / 확인된 분류: ${input.verifiedCategory ?? '미확인'}${
    input.description ? ` / 사용자 설명: "${input.description}"` : ''
  }`;

  const result = await askGeminiForJsonWithGrounding<RawGeneratedGymExercise>({
    systemInstruction,
    contextText: '',
    question,
    validate: isRawGeneratedGymExercise,
  });

  if (!result.ok) return { ok: false, message: result.message };
  const raw = result.data;
  const gymBodyPart = LABEL_TO_BODY_PART[raw.gymBodyPart];
  const difficultyMap: Record<GymDifficulty, Technique['difficulty']> = { 초급: 'beginner', 중급: 'intermediate', 고급: 'advanced' };

  const technique: Technique = {
    id: input.id,
    martialArt: GYM_MARTIAL_ART_ID,
    name: input.name,
    koreanName: input.name,
    aliases: [],
    category: raw.gymBodyPart,
    positions: [],
    description: raw.description,
    purpose: null,
    principles: [],
    variations: [],
    counters: [],
    defenses: [],
    transitions: [],
    relatedTechniques: [],
    relatedMartialArts: [],
    difficulty: difficultyMap[raw.gymDifficulty as GymDifficulty],
    tags: [...raw.secondaryMuscles, ...raw.gymEquipment, '웨이트', raw.primaryMuscle],
    youtubeSearchQuery: `${input.name} 운동 방법`,
    videos: [],
    source: 'user_added',
    gymBodyPart,
    primaryMuscle: raw.primaryMuscle,
    secondaryMuscles: raw.secondaryMuscles,
    gymEquipment: raw.gymEquipment,
    gymDifficulty: raw.gymDifficulty as GymDifficulty,
    gymExerciseKind: raw.gymExerciseKind as GymExerciseKind,
    gymWeightCalcType: raw.weightCalcType as GymWeightCalcType,
    gymPostureNotes: raw.postureNotes,
    recommendedSets: raw.recommendedSets ?? undefined,
    recommendedReps: raw.recommendedReps,
    recommendedDurationSeconds: raw.recommendedDurationSeconds,
    recommendedRestSeconds: raw.recommendedRestSeconds ?? undefined,
  };

  return { ok: true, record: { technique } };
}
