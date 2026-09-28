// Mirrors userTechniques/recordGenerator.ts, but generates a home-training
// exercise record instead of a combat technique. Kept as a fully separate
// file so the existing technique-request flow is never at risk.
import type { Difficulty, HomeExerciseEquipment, HomeExerciseType, PostureInfo, Technique } from '../../types';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../homeTraining/library';

const VALID_DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced', null];
const VALID_EXERCISE_TYPES: HomeExerciseType[] = [
  'strength',
  'conditioning',
  'mobility',
  'flexibility',
  'combat_movement',
  'striking_drill',
  'grappling_drill',
  'footwork',
  'recovery',
];
const VALID_EQUIPMENT: HomeExerciseEquipment[] = ['none', 'mat', 'jump_rope', 'dumbbell', 'band', 'pull_up_bar', 'other'];

interface RawGeneratedExercise {
  category: string;
  koreanName: string | null;
  aliases: string[];
  description: string;
  purpose: string;
  exerciseType: string;
  equipment: string[];
  difficulty: Difficulty;
  tags: string[];
  recommendedSets: number | null;
  recommendedReps: number | null;
  recommendedDurationSeconds: number | null;
  recommendedRestSeconds: number | null;
  posture: {
    overview: string;
    startingPosition?: string;
    steps?: string[];
    keyPoints?: string[];
    commonMistakes?: string[];
  } | null;
}

function isRawGeneratedExercise(data: unknown): data is RawGeneratedExercise {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.category === 'string' &&
    (d.koreanName === null || typeof d.koreanName === 'string') &&
    Array.isArray(d.aliases) &&
    typeof d.description === 'string' &&
    typeof d.purpose === 'string' &&
    typeof d.exerciseType === 'string' &&
    VALID_EXERCISE_TYPES.includes(d.exerciseType as HomeExerciseType) &&
    Array.isArray(d.equipment) &&
    VALID_DIFFICULTIES.includes(d.difficulty as Difficulty) &&
    Array.isArray(d.tags) &&
    (d.posture === null || (typeof d.posture === 'object' && typeof (d.posture as any).overview === 'string'))
  );
}

export interface GeneratedExerciseRecord {
  technique: Technique;
}

/**
 * Generates the full exercise record in the SAME Technique shape every
 * other technique/exercise uses (never a parallel data format) —
 * `positions`/`counters`/`defenses`/`transitions`/`relatedMartialArts` are
 * always forced to `[]` and `relatedTechniques` is never populated here
 * (an exercise the AI just discovered has no verified connection to a real
 * combat technique yet; a human can add that later via the app's own
 * editing surface if one exists). `martialArt` is hardcoded to
 * HOME_TRAINING_MARTIAL_ART_ID — this function deliberately has no
 * "confirmed martial art" override path like techniqueDiscovery's
 * resolveConfirmedMartialArt, so the AI can never re-file an exercise
 * under a real combat martial art.
 */
export async function generateExerciseRecord(input: {
  id: string;
  name: string;
  description?: string;
  verifiedCategory: string | null;
}): Promise<{ ok: true; record: GeneratedExerciseRecord } | { ok: false; message: string }> {
  const systemInstruction = [
    '검증이 완료된 새 홈트레이닝 운동의 상세 정보를 Martialdex의 기존 운동 데이터 형식에 맞춰 작성한다.',
    '확실하지 않은 세부사항을 사실인 것처럼 지어내지 않는다 — 일반적으로 알려진 수행법 정보만 작성한다.',
    '',
    'description은 운동에 대한 객관적인 설명 2~3문장.',
    'purpose는 이 운동의 목적/효과 1~2문장 — 과장하지 않는다.',
    `exerciseType은 다음 중 하나: ${VALID_EXERCISE_TYPES.join(', ')}.`,
    `equipment는 이 운동에 필요한 장비 목록(다음 중에서만 고름): ${VALID_EQUIPMENT.join(', ')}. 장비가 필요 없으면 ["none"]만 넣는다.`,
    'difficulty는 "beginner" | "intermediate" | "advanced" | null 중 하나(확신 없으면 null).',
    'tags는 "#"로 시작하는 짧은 분류 태그 2~4개.',
    'recommendedSets/recommendedReps/recommendedDurationSeconds/recommendedRestSeconds는 일반적으로 권장되는 기본값(숫자, 확신 없으면 null) —',
    '시간 기반 운동(플랭크 등)은 recommendedReps를 null로, recommendedDurationSeconds를 채운다. 반복 기반 운동은 그 반대로 한다.',
    '',
    'posture는 수행 방법 설명이다 (가능한 경우에만 채우고, 확신 없는 세부 필드는 생략):',
    '- overview: 전체 개요 1~2문장 (필수)',
    '- startingPosition: 시작 자세',
    '- steps: 동작 과정을 순서대로 나열한 배열 (예: "1단계 — ...", "2단계 — ...")',
    '- keyPoints: 핵심 포인트 배열',
    '- commonMistakes: 흔한 실수 배열',
    '수행법 정보를 충분히 확신할 수 없으면 posture 전체를 null로 둔다.',
    '',
    '출력 형식: {"category": string, "koreanName": string|null, "aliases": string[], "description": string, "purpose": string,',
    '"exerciseType": string, "equipment": string[], "difficulty": string|null, "tags": string[],',
    '"recommendedSets": number|null, "recommendedReps": number|null, "recommendedDurationSeconds": number|null, "recommendedRestSeconds": number|null,',
    '"posture": {"overview": string, "startingPosition"?: string, "steps"?: string[], "keyPoints"?: string[], "commonMistakes"?: string[]} | null}',
  ].join('\n');

  const question = `운동명: "${input.name}" / 확인된 분류: ${input.verifiedCategory ?? '미확인'}${
    input.description ? ` / 사용자 설명: "${input.description}"` : ''
  }`;

  const result = await askGeminiForJsonWithGrounding<RawGeneratedExercise>({
    systemInstruction,
    contextText: '',
    question,
    validate: isRawGeneratedExercise,
  });

  if (!result.ok) return { ok: false, message: result.message };
  const raw = result.data;

  const equipment = raw.equipment.filter((e): e is HomeExerciseEquipment => VALID_EQUIPMENT.includes(e as HomeExerciseEquipment));

  const posture: PostureInfo | undefined = raw.posture
    ? {
        overview: raw.posture.overview,
        startingPosition: raw.posture.startingPosition,
        steps: raw.posture.steps,
        keyPoints: raw.posture.keyPoints,
        commonMistakes: raw.posture.commonMistakes,
      }
    : undefined;

  const technique: Technique = {
    id: input.id,
    martialArt: HOME_TRAINING_MARTIAL_ART_ID,
    name: input.name,
    koreanName: raw.koreanName,
    aliases: raw.aliases,
    category: raw.category,
    positions: [],
    description: raw.description,
    purpose: raw.purpose,
    principles: [],
    variations: [],
    counters: [],
    defenses: [],
    transitions: [],
    relatedTechniques: [],
    relatedMartialArts: [],
    difficulty: raw.difficulty,
    tags: raw.tags,
    youtubeSearchQuery: `${input.name} exercise tutorial`,
    videos: [],
    posture,
    source: 'user_added',
    exerciseType: raw.exerciseType as HomeExerciseType,
    equipment: equipment.length > 0 ? equipment : ['none'],
    recommendedSets: raw.recommendedSets ?? undefined,
    recommendedReps: raw.recommendedReps,
    recommendedDurationSeconds: raw.recommendedDurationSeconds,
    recommendedRestSeconds: raw.recommendedRestSeconds ?? undefined,
  };

  return { ok: true, record: { technique } };
}
