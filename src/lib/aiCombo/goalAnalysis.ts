import { askGeminiForJson, type GeminiJsonOutcome } from '../fighterStyle/geminiJson';
import { martialArtSummaries } from '../loadData';
import type { ComboGoalAnalysis, ComboOffenseDefense } from './types';
import { MMA_MARTIAL_ART_ID, MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';

const VALID_OFFENSE_DEFENSE: ComboOffenseDefense[] = ['offense', 'defense', 'mixed'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isStepArray(v: unknown): v is ComboGoalAnalysis['steps'] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((s) => {
      if (!s || typeof s !== 'object') return false;
      const step = s as Record<string, unknown>;
      return (
        typeof step.phrase === 'string' &&
        typeof step.purpose === 'string' &&
        typeof step.opponentReaction === 'string' &&
        typeof step.followUpIfReacts === 'string'
      );
    })
  );
}

function isComboGoalAnalysis(data: unknown): data is ComboGoalAnalysis {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.martialArt === 'string' &&
    typeof d.offenseOrDefense === 'string' &&
    VALID_OFFENSE_DEFENSE.includes(d.offenseOrDefense as ComboOffenseDefense) &&
    typeof d.startingSituation === 'string' &&
    typeof d.range === 'string' &&
    typeof d.position === 'string' &&
    typeof d.expectedOpponentReaction === 'string' &&
    typeof d.finalGoal === 'string' &&
    isStringArray(d.prerequisiteTechniques) &&
    isStringArray(d.connectingTechniques) &&
    isStepArray(d.steps) &&
    isStringArray(d.pros) &&
    isStringArray(d.cautions) &&
    isStringArray(d.complementaryFollowUps) &&
    isStringArray(d.alternativeTechniques) &&
    typeof d.summary === 'string'
  );
}

const MARTIAL_ART_ID_LIST = [
  ...martialArtSummaries.map((a) => `${a.id} (${a.nameKo})`),
  `${MMA_MARTIAL_ART_ID} (MMA - 여러 무술을 종합한 종합격투기, 실제 기술 백과사전 없이 다음 무술 기술을 조합: ${MMA_SOURCE_MARTIAL_ARTS.join(', ')})`,
].join(', ');

export interface AnalyzeComboGoalInput {
  freeText: string;
  martialArtHint: string;
}

/**
 * The single Gemini call behind "AI 목적 기반 콤비네이션 생성" (spec sections
 * 5, 16). Extracts a structured tactical breakdown AND an ordered list of
 * step phrases — the ordering IS the "논리적인 연결" the spec asks for, but
 * every phrase is still just free text; techniqueMatcher.ts resolves each
 * one to a real technique id afterward, never trusting this call to name a
 * real id directly (same separation of concerns as aiCurriculum/goalAnalysis.ts).
 */
export async function analyzeComboGoal(input: AnalyzeComboGoalInput): Promise<GeminiJsonOutcome<ComboGoalAnalysis>> {
  const systemInstruction = [
    '사용자가 스파링/실전에서 달성하고 싶은 목적이나 상황을 자유롭게 설명한 글을 분석해서,',
    '그 목적을 달성하기 위한 논리적인 기술 연결(콤비네이션)의 재료를 뽑아낸다.',
    '',
    `유효한 무술 id 목록(이 중 하나만 사용): ${MARTIAL_ART_ID_LIST}`,
    '사용자가 이미 무술을 선택했다면(martialArtHint) 텍스트가 명확히 다른 무술을 말하지 않는 한 그 값을 그대로 사용한다.',
    '',
    '분석할 내용:',
    '- offenseOrDefense: 이 콤비네이션이 공격("offense")인지 방어/카운터("defense")인지 상황에 따른 복합("mixed")인지',
    '- startingSituation: 콤비네이션이 시작되는 상황 (예: "스탠딩, 서로 거리를 둔 상태")',
    '- range: 시작 시점의 거리 (예: "타격 거리", "클린치 거리")',
    '- position: 시작 시점의 포지션 (예: "스탠딩", "클린치")',
    '- expectedOpponentReaction: 각 단계에서 상대가 보일 것으로 예상되는 반응 (예: "상대가 뒤로 물러남")',
    '- finalGoal: 이 콤비네이션의 최종 목적 (예: "테이크다운 성공", "타격으로 KO")',
    '- prerequisiteTechniques: 이 콤비네이션을 수행하기 전에 이미 할 수 있어야 하는 선행 기술 phrase 배열',
    '- connectingTechniques: 단계 사이를 자연스럽게 이어주는 연결 기술 phrase 배열 (footwork, feint 등)',
    '',
    'steps는 실제로 순서대로 수행할 기술들이다 (최소 2개, 보통 3~6개). 각 step은 다음 4개 필드를 가진다:',
    '- phrase: 기술명(영문/로마자 선호) — 실제 기술 데이터베이스의 검색어로 쓰이므로 표준적인 무술 용어를 사용하고',
    '  기술 id를 만들어내지 않는다(그건 이후 단계에서 검색으로 매칭한다).',
    '- purpose: 이 단계가 다음 단계를 어떻게 준비시키는지 한국어 한 문장 (예: "상대의 시선을 위로 유도해 하체를 비움").',
    '- opponentReaction: "이 단계"에 대해 상대가 보일 것으로 예상되는 구체적 반응 한국어 한 문장',
    '  (예: "가드를 올려 얼굴을 방어하며 뒤로 물러남") — expectedOpponentReaction(콤비네이션 전체에 대한 반응)과',
    '  달리 매 step마다 다르게 서술한다.',
    '- followUpIfReacts: 그 반응이 나왔을 때 다음에 무엇을 해야 하는지 한국어 한 문장 (다음 step으로 자연스럽게',
    '  이어지는 이유, 혹은 반응이 예상과 다를 때의 대응).',
    'steps의 순서 자체가 콤비네이션의 논리적 흐름이므로 신중하게 정한다 — 무작위로 나열하지 않는다.',
    input.martialArtHint === MMA_MARTIAL_ART_ID
      ? `MMA는 별도의 기술 백과사전이 없고 다음 무술 기술을 조합해서 구성한다: ${MMA_SOURCE_MARTIAL_ARTS.join(', ')}.`
      : '',
    '',
    '추가로 다음도 분석한다:',
    '- pros: 이 콤비네이션이 왜 효과적인지 구체적인 전술적 장점 (한국어, 최대 4개) — "좋은 콤보입니다" 같은 막연한',
    '  칭찬이 아니라 왜 효과적인지(거리/타이밍/포지션 우위 등)를 설명한다.',
    '- cautions: 실행 시 주의해야 할 점, 실패하기 쉬운 부분, 상대에게 역이용당할 수 있는 지점 (한국어, 최대 4개).',
    '- complementaryFollowUps: 이 콤비네이션이 성공한 뒤에 이어가면 좋은 후속 기술 phrase 배열 (steps와 같은 방식의',
    '  기술명, 최대 3개) — steps 자체에 포함하지 않는다.',
    '- alternativeTechniques: 상대가 예상과 다르게 반응하거나 다른 상황일 때 이 콤비네이션 대신 쓸 수 있는 대체',
    '  기술 phrase 배열 (최대 3개).',
    '',
    'summary는 "목적: ..." 형태로 쓸 수 있는 한국어 한 줄 요약이다.',
    '',
    '출력 형식(JSON 객체 하나):',
    '{',
    '  "martialArt": string,',
    '  "offenseOrDefense": "offense" | "defense" | "mixed",',
    '  "startingSituation": string,',
    '  "range": string,',
    '  "position": string,',
    '  "expectedOpponentReaction": string,',
    '  "finalGoal": string,',
    '  "prerequisiteTechniques": string[],',
    '  "connectingTechniques": string[],',
    '  "steps": [{"phrase": string, "purpose": string, "opponentReaction": string, "followUpIfReacts": string}],',
    '  "pros": string[],',
    '  "cautions": string[],',
    '  "complementaryFollowUps": string[],',
    '  "alternativeTechniques": string[],',
    '  "summary": string',
    '}',
  ]
    .filter(Boolean)
    .join('\n');

  const contextParts = [`무술(선택됨): ${input.martialArtHint}`];

  return askGeminiForJson<ComboGoalAnalysis>({
    systemInstruction,
    contextText: contextParts.join('\n'),
    question: `사용자 입력: "${input.freeText.trim()}"`,
    validate: isComboGoalAnalysis,
  });
}
