import { askGeminiForJson, type GeminiJsonOutcome } from './geminiJson';
import type { DurationRecommendation, FighterStyleAnalysis, UserLevel } from './types';
import { MAX_DURATION_DAYS, MIN_DURATION_DAYS } from './types';

function isDurationRecommendation(data: unknown): data is DurationRecommendation {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.recommendedDays === 'number' && Number.isFinite(d.recommendedDays) && typeof d.reason === 'string';
}

const LEVEL_LABEL: Record<UserLevel, string> = {
  first_time: '격투기를 처음 시작함',
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

/**
 * Asks Gemini to recommend a study duration. The number is clamped to
 * [MIN_DURATION_DAYS, MAX_DURATION_DAYS] regardless of what comes back — an
 * out-of-range or malformed suggestion never reaches the UI as-is. If the
 * call itself fails, the caller must NOT fabricate a fallback "AI
 * recommendation" — it should surface the error and let the user pick a
 * duration manually instead (see FighterStyleLearning.tsx).
 */
export async function recommendDuration(params: {
  fighterName: string;
  styleAnalysis: FighterStyleAnalysis;
  userLevel: UserLevel;
  matchedTechniqueCount: number;
}): Promise<GeminiJsonOutcome<DurationRecommendation>> {
  const result = await askGeminiForJson<DurationRecommendation>({
    systemInstruction: [
      '사용자가 특정 선수의 스타일을 배우는 학습 커리큘럼을 만들려고 한다.',
      '사용자의 현재 수준, 스타일의 복잡도, 관련 기술 수를 고려해 적절한 학습 기간(일 단위)을 추천한다.',
      `기간은 ${MIN_DURATION_DAYS}일에서 ${MAX_DURATION_DAYS}일 사이의 정수여야 한다.`,
      '일반적으로 수준이 낮을수록, 다뤄야 할 기술/개념이 많을수록 더 긴 기간이 필요하다.',
      '출력 형식: {"recommendedDays": number, "reason": string(한국어, 1~2문장)}',
    ].join('\n'),
    contextText: [
      `사용자 수준: ${LEVEL_LABEL[params.userLevel]}`,
      `관련 기술 수: ${params.matchedTechniqueCount}개`,
      `스타일 요약: ${params.styleAnalysis.styleSummary}`,
      `핵심 기술: ${params.styleAnalysis.keyTechniques.join(', ')}`,
    ].join('\n'),
    question: `${params.fighterName} 스타일을 배우는 데 적절한 학습 기간을 추천해줘.`,
    validate: isDurationRecommendation,
  });

  if (!result.ok) return result;

  const clamped = Math.round(Math.max(MIN_DURATION_DAYS, Math.min(MAX_DURATION_DAYS, result.data.recommendedDays)));
  return { ok: true, data: { recommendedDays: clamped, reason: result.data.reason } };
}
