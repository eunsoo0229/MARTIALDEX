import type { Difficulty, PostureInfo, Technique } from '../../types';
import { getTechniquesByMartialArt } from '../loadData';
import { askGeminiForJsonWithGrounding } from './geminiJson';
// searchAllTechniques (not the official-only searchTechniques) so a
// relatedTechniqueName can resolve to a previously-discovered add_teq/
// user_techniques technique too, not just the 1,253 official ones.
import { searchAllTechniques } from './service';

const VALID_DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced', null];

interface RawGeneratedRecord {
  category: string;
  koreanName: string | null;
  aliases: string[];
  description: string;
  purpose: string;
  whenToUse: string;
  principles: string[];
  difficulty: Difficulty;
  tags: string[];
  relatedTechniqueNames: string[];
  posture: {
    overview: string;
    startingPosition?: string;
    steps?: string[];
    keyPoints?: string[];
    commonMistakes?: string[];
  } | null;
}

function isRawGeneratedRecord(data: unknown): data is RawGeneratedRecord {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.category === 'string' &&
    (d.koreanName === null || typeof d.koreanName === 'string') &&
    Array.isArray(d.aliases) &&
    typeof d.description === 'string' &&
    typeof d.purpose === 'string' &&
    typeof d.whenToUse === 'string' &&
    Array.isArray(d.principles) &&
    VALID_DIFFICULTIES.includes(d.difficulty as Difficulty) &&
    Array.isArray(d.tags) &&
    Array.isArray(d.relatedTechniqueNames) &&
    (d.posture === null || (typeof d.posture === 'object' && typeof (d.posture as any).overview === 'string'))
  );
}

export interface GeneratedTechniqueRecord {
  technique: Technique;
}

/**
 * Generates the full technique record in the EXACT same shape as the
 * 1,253 official techniques (spec section 8) — never a new/parallel data
 * format. relatedTechniques is the one field never trusted blindly: the
 * model is only shown real technique NAMES from the same martial art and
 * asked to pick among them, then every pick is re-validated against the
 * real search index before being written to relatedTechniqueIds — an
 * id/name the model invents (or a name close enough to fool a naive match)
 * never survives this filter (spec section 12).
 */
export async function generateTechniqueRecord(input: {
  id: string;
  name: string;
  martialArt: string;
  description?: string;
  verifiedCategory: string | null;
}): Promise<{ ok: true; record: GeneratedTechniqueRecord } | { ok: false; message: string }> {
  const sameArtTechniques = getTechniquesByMartialArt(input.martialArt);
  const candidatePool = sameArtTechniques.slice(0, 200); // cap prompt size — same art can have 100s of techniques
  const candidateNames = candidatePool.map((t) => `${t.name}${t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''}`).join(', ');

  const systemInstruction = [
    '검증이 완료된 새 무술 기술의 상세 정보를 Martialdex의 기존 기술 데이터 형식에 맞춰 작성한다.',
    '확실하지 않은 세부사항을 사실인 것처럼 지어내지 않는다 — 일반적으로 알려진 원리/자세 정보만 작성한다.',
    '',
    'description은 기술에 대한 객관적인 설명 2~4문장.',
    'purpose는 이 기술을 사용하는 목적 1~2문장.',
    'whenToUse는 어떤 상황에서 효과적인지 1~2문장.',
    'principles는 핵심 원리 2~5개(짧은 구).',
    'difficulty는 "beginner" | "intermediate" | "advanced" | null 중 하나(확신 없으면 null).',
    'tags는 "#"로 시작하는 짧은 분류 태그 2~5개.',
    '',
    `relatedTechniqueNames는 아래 같은 무술의 실제 기존 기술 이름 목록에서만 골라야 한다(최대 5개, 없으면 빈 배열).`,
    '목록에 없는 이름을 지어내지 않는다.',
    `같은 무술의 기존 기술 이름 목록: ${candidateNames || '(없음)'}`,
    '',
    'posture는 자세 설명이다 (가능한 경우에만 채우고, 확신 없는 세부 필드는 생략):',
    '- overview: 전체 개요 2~3문장 (필수)',
    '- startingPosition: 시작 자세',
    '- steps: 동작 과정을 순서대로 나열한 배열 (예: "1단계 — ...", "2단계 — ...")',
    '- keyPoints: 핵심 포인트 배열',
    '- commonMistakes: 흔한 실수 배열',
    '자세 정보를 충분히 확신할 수 없으면 posture 전체를 null로 둔다.',
    '',
    '출력 형식: {"category": string, "koreanName": string|null, "aliases": string[], "description": string, "purpose": string,',
    '"whenToUse": string, "principles": string[], "difficulty": string|null, "tags": string[], "relatedTechniqueNames": string[],',
    '"posture": {"overview": string, "startingPosition"?: string, "steps"?: string[], "keyPoints"?: string[], "commonMistakes"?: string[]} | null}',
  ].join('\n');

  const question = `기술명: "${input.name}" / 무술: ${input.martialArt} / 확인된 분류: ${input.verifiedCategory ?? '미확인'}${
    input.description ? ` / 사용자 설명: "${input.description}"` : ''
  }`;

  const result = await askGeminiForJsonWithGrounding<RawGeneratedRecord>({
    systemInstruction,
    contextText: '',
    question,
    validate: isRawGeneratedRecord,
  });

  if (!result.ok) return { ok: false, message: result.message };
  const raw = result.data;

  // Only technique ids that are real, resolvable search hits within the
  // same martial art ever make it into relatedTechniques — a name the
  // model invented (or one that doesn't resolve to a confident search
  // match) is silently dropped, never fabricated into an id.
  const relatedTechniqueIds: string[] = [];
  for (const relatedName of raw.relatedTechniqueNames.slice(0, 5)) {
    const hits = searchAllTechniques(relatedName, 1, { martialArt: input.martialArt });
    if (hits[0] && !relatedTechniqueIds.includes(hits[0].id)) relatedTechniqueIds.push(hits[0].id);
  }

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
    martialArt: input.martialArt,
    name: input.name,
    koreanName: raw.koreanName,
    aliases: raw.aliases,
    category: raw.category,
    positions: [],
    // Technique has no dedicated "언제 사용하는가" field — folded into
    // description (as its own paragraph) rather than inventing a new field,
    // per spec section 8's "기존 구조를 그대로 사용" requirement.
    description: raw.whenToUse ? `${raw.description}\n\n사용 상황: ${raw.whenToUse}` : raw.description,
    purpose: raw.purpose,
    principles: raw.principles,
    variations: [],
    counters: [],
    defenses: [],
    transitions: [],
    relatedTechniques: relatedTechniqueIds,
    relatedMartialArts: [],
    difficulty: raw.difficulty,
    tags: raw.tags,
    youtubeSearchQuery: `${input.martialArt} ${input.name} tutorial`,
    videos: [],
    posture,
    source: 'user_added',
  };

  return { ok: true, record: { technique } };
}
