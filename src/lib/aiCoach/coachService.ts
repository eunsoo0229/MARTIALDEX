import { askGeminiForJson } from '../fighterStyle/geminiJson';
import type { CoachRecommendation } from './types';
import { buildBaseRecommendation, templateReason, type BaseCoachRecommendation } from './coachEngine';
import { computeBaseHash, getCachedCoaching, setCachedCoaching } from './coachCache';
import { buildCoachContext } from '../ai/context';

interface AiReasonResponse {
  reason: string;
}

function isAiReasonResponse(data: unknown): data is AiReasonResponse {
  return !!data && typeof data === 'object' && typeof (data as Record<string, unknown>).reason === 'string';
}

// The AI is given the recommendation coachEngine.ts ALREADY decided and is
// only asked to explain it in natural language — it never chooses or
// returns a technique id, so there is no fabrication surface here at all.
async function narrateWithAi(base: BaseCoachRecommendation, contextText: string) {
  return askGeminiForJson<AiReasonResponse>({
    systemInstruction: [
      '당신은 사용자의 실제 학습 데이터를 바탕으로 "오늘의 훈련 추천 이유"를 설명하는 AI 개인 코치입니다.',
      '아래 "오늘의 추천" 항목(우선 학습/복습/새 기술)은 이미 코드가 실제 데이터를 근거로 결정했다 — 당신은 그 선택을 바꾸지 않고, 왜 이런 추천이 나왔는지를 2~3문장의 친근하고 간결한 한국어로 설명하는 역할만 한다.',
      '사용자의 실제 실력을 확정적으로 판단하는 표현(예: "당신은 초보자입니다", "실력이 부족합니다")은 쓰지 않는다.',
      '이 추천은 AI 분석 기록을 기반으로 한 참고용 학습 추천이며, 전문 지도자의 지도를 대체하지 않는다.',
      '출력 형식: {"reason": string}',
    ].join('\n'),
    contextText: [
      `오늘의 추천 - 우선 학습: ${base.priority?.techniqueName ?? '(없음)'}`,
      `오늘의 추천 - 복습: ${base.review?.techniqueName ?? '(없음)'}`,
      `오늘의 추천 - 새로운 기술: ${base.newTechnique?.techniqueName ?? '(없음)'}`,
      '',
      contextText,
    ].join('\n'),
    question: '위 추천 이유를 설명해줘.',
    validate: isAiReasonResponse,
  });
}

export async function getCoaching(force = false): Promise<{ recommendation: CoachRecommendation; aiFailed: boolean }> {
  const base = buildBaseRecommendation();
  const baseHash = computeBaseHash(base);
  const cached = getCachedCoaching();
  if (!force && cached && cached.baseHash === baseHash) {
    return { recommendation: cached.recommendation, aiFailed: false };
  }

  const contextText = buildCoachContext();
  const aiResult = await narrateWithAi(base, contextText);
  const recommendation: CoachRecommendation = {
    ...base,
    generatedAt: new Date().toISOString(),
    reason: aiResult.ok ? aiResult.data.reason : templateReason(base),
    source: aiResult.ok ? 'ai' : 'fallback',
  };
  setCachedCoaching(baseHash, recommendation);
  return { recommendation, aiFailed: !aiResult.ok };
}
