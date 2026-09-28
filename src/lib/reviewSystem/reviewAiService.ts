import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { computeReviewCandidates } from './reviewEngine';
import type { ReviewCandidate, WeeklyReviewPlan } from './types';
import { REVIEW_TIER_LABEL } from './types';

interface AiWeeklyResponse {
  summary: string;
}

function isAiWeeklyResponse(data: unknown): data is AiWeeklyResponse {
  return !!data && typeof data === 'object' && typeof (data as Record<string, unknown>).summary === 'string';
}

function fallbackWeeklySummary(candidates: ReviewCandidate[]): string {
  const today = candidates.filter((c) => c.tier === 'today');
  const soon = candidates.filter((c) => c.tier === 'soon');
  if (today.length === 0 && soon.length === 0) {
    return '이번 주에 특별히 복습이 급한 기술은 없습니다 — 지금까지 학습한 기술들이 잘 유지되고 있습니다.';
  }
  const parts: string[] = [];
  if (today.length) parts.push(`오늘 복습이 필요한 기술: ${today.slice(0, 5).map((c) => c.techniqueName).join(', ')}.`);
  if (soon.length) parts.push(`곧 복습이 필요한 기술: ${soon.slice(0, 5).map((c) => c.techniqueName).join(', ')}.`);
  return parts.join(' ');
}

// 6번 "이번 주에 무엇을 복습해야 할까?" — AI는 이미 계산된 실제 후보 목록과
// 우선순위(reviewEngine.ts)를 자연어로 정리만 할 뿐, 목록에 없는 기술을 새로
// 골라내지 않는다(같은 "서술만 AI, 판단은 코드" 경계, 12/18단계와 동일).
export async function getWeeklyReviewPlan(): Promise<WeeklyReviewPlan> {
  const generatedAt = new Date().toISOString();
  const candidates = computeReviewCandidates();

  if (candidates.length === 0) {
    return { summary: '아직 복습할 만한 학습 기록이 없습니다. 먼저 기술을 학습하거나 자세 분석을 진행해보세요.', source: 'fallback', generatedAt };
  }

  const lines = candidates.slice(0, 15).map((c) => `- ${c.techniqueName} [${REVIEW_TIER_LABEL[c.tier]}]: ${c.reason}`);

  const aiResult = await askGeminiForJson<AiWeeklyResponse>({
    systemInstruction: [
      '사용자의 실제 복습 필요 기술 목록(이미 우선순위가 계산되어 있음)을 바탕으로 "이번 주 복습 계획"을 자연스러운 한국어로 안내하는 역할이다.',
      '아래 목록에 있는 기술과 우선순위만 근거로 사용하고, 목록에 없는 기술을 새로 언급하거나 지어내지 않는다.',
      '3~5문장으로 간결하게, 어떤 기술을 먼저 복습하면 좋을지 안내한다.',
      '출력 형식: {"summary": string}',
    ].join('\n'),
    contextText: lines.join('\n'),
    question: '이번 주에 무엇을 복습해야 할까?',
    validate: isAiWeeklyResponse,
  });

  if (aiResult.ok) return { summary: aiResult.data.summary, source: 'ai', generatedAt };
  return { summary: fallbackWeeklySummary(candidates), source: 'fallback', generatedAt };
}
