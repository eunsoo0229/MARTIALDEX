import { askGeminiForJson, type GeminiJsonOutcome } from './geminiJson';
import type { FighterCandidate, FighterStyleAnalysis } from './types';
import { cacheStyleAnalysis, getCachedStyleAnalysis } from './fighterProfileStore';

function isStyleAnalysis(data: unknown): data is Omit<FighterStyleAnalysis, 'fighterId' | 'fighterName' | 'generatedAt'> {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const arrayFields = [
    'primaryStyles',
    'keyStrengths',
    'preferredPositions',
    'keyTechniques',
    'transitions',
    'distanceManagement',
    'defensiveConcepts',
    'offensiveConcepts',
    'trainingFocus',
  ];
  return typeof d.styleSummary === 'string' && arrayFields.every((f) => Array.isArray(d[f]));
}

const STYLE_ANALYSIS_INSTRUCTION = [
  '당신은 무술/격투기 학습 보조 AI다. 특정 선수의 "공개적으로 잘 알려진 경기 스타일"을 학습용으로',
  '구조화해서 분석한다. 이것은 그 선수의 실력을 공식적으로 정의하거나 확정하는 자료가 아니라,',
  '공개된 경기/인터뷰/해설에서 일반적으로 알려진 스타일 특징을 정리한 학습 참고 자료다.',
  '',
  '중요:',
  '- 확인되지 않았거나 불확실한 사실을 단정적으로 지어내지 않는다.',
  '- 선수의 스타일을 과장하지 않는다.',
  '- keyTechniques, preferredPositions, transitions에는 가능하면 표준적인 무술 기술/포지션',
  '  용어(영문 또는 로마자 표기, 예: "Double Leg", "Back Control", "Guillotine Choke", "Jab",',
  '  "Round Kick")를 사용한다 — 이후 실제 기술 데이터베이스와 매칭하는 데 사용되기 때문이다.',
  '- 각 배열 항목은 짧은 구(phrase) 형태로, 5~8개 내외로 작성한다.',
  '',
  '출력 형식(JSON 객체 하나):',
  '{',
  '  "styleSummary": string,',
  '  "primaryStyles": string[],',
  '  "keyStrengths": string[],',
  '  "preferredPositions": string[],',
  '  "keyTechniques": string[],',
  '  "transitions": string[],',
  '  "distanceManagement": string[],',
  '  "defensiveConcepts": string[],',
  '  "offensiveConcepts": string[],',
  '  "trainingFocus": string[]',
  '}',
].join('\n');

export async function getOrGenerateStyleAnalysis(
  fighter: FighterCandidate,
  forceRefresh = false
): Promise<GeminiJsonOutcome<FighterStyleAnalysis>> {
  if (!forceRefresh) {
    const cached = getCachedStyleAnalysis(fighter.id);
    if (cached) return { ok: true, data: cached };
  }

  const result = await askGeminiForJson<Omit<FighterStyleAnalysis, 'fighterId' | 'fighterName' | 'generatedAt'>>({
    systemInstruction: STYLE_ANALYSIS_INSTRUCTION,
    contextText: `선수: ${fighter.name} (${fighter.sport})\n간단 설명: ${fighter.shortDescription}`,
    question: `${fighter.name}의 경기 스타일을 위 형식대로 분석해줘.`,
    validate: isStyleAnalysis,
  });

  if (!result.ok) return result;

  const analysis: FighterStyleAnalysis = {
    ...result.data,
    fighterId: fighter.id,
    fighterName: fighter.name,
    generatedAt: new Date().toISOString(),
  };
  cacheStyleAnalysis(analysis);
  return { ok: true, data: analysis };
}
