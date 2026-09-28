import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { getTechnique } from '../loadData';
import { classifyPosition, POSITION_LABEL, type CanonicalPosition } from '../skillProgress/positionClassifier';
import { computeAllSkillProgress, findRecentlyImproved, rankWeakness } from '../skillProgress/weaknessEngine';
import { listTrainingHistory } from '../trainingHistory/service';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { getPreviousPeriodRange, isWithinPeriod, isWithinRange } from './periodUtils';
import type { AiTrainingSummary, PeriodKey } from './types';
import { PERIOD_LABEL } from './types';

type NamedPosition = Exclude<CanonicalPosition, 'other'>;

function countByPosition(techniqueIds: string[]): Map<NamedPosition, number> {
  const counts = new Map<NamedPosition, number>();
  for (const id of techniqueIds) {
    const t = getTechnique(id);
    if (!t) continue;
    const pos = classifyPosition(t);
    if (pos === 'other') continue;
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  return counts;
}

interface SummaryContext {
  currentHistory: TrainingHistoryEntry[];
  prevHistory: TrainingHistoryEntry[];
  currentMinutes: number;
  prevMinutes: number;
  currentPos: Map<NamedPosition, number>;
  prevPos: Map<NamedPosition, number>;
  currentSparring: number;
  prevSparring: number;
  weaknessNames: string[];
  improvedNames: string[];
  hasPrev: boolean;
}

// Every number here is a REAL period-over-period comparison — the AI is
// handed this already-computed context and only asked to phrase it (same
// "narrate, don't decide" boundary as aiCoach/coachService.ts, 12단계), so
// there's no way for it to invent a trend that isn't actually in the data.
function buildSummaryContext(period: PeriodKey): SummaryContext {
  const allHistory = listTrainingHistory().filter((h) => h.completed);
  const currentHistory = allHistory.filter((h) => isWithinPeriod(h.completedAt, period));
  const prevRange = getPreviousPeriodRange(period);
  const prevHistory = prevRange ? allHistory.filter((h) => isWithinRange(h.completedAt, prevRange)) : [];

  const currentMinutes = currentHistory.reduce((sum, h) => sum + (h.actualMinutes ?? h.estimatedMinutes), 0);
  const prevMinutes = prevHistory.reduce((sum, h) => sum + (h.actualMinutes ?? h.estimatedMinutes), 0);

  const allSparring = listSparringSessions();
  const currentSparring = allSparring.filter((s) => isWithinPeriod(s.date, period)).length;
  const prevSparring = prevRange ? allSparring.filter((s) => isWithinRange(s.date, prevRange)).length : 0;

  const skillEntries = computeAllSkillProgress();
  const weaknessNames = rankWeakness(skillEntries, { limit: 3 }).map((w) => w.techniqueName);
  const improvedNames = findRecentlyImproved(skillEntries, 3).map((i) => i.techniqueName);

  return {
    currentHistory,
    prevHistory,
    currentMinutes,
    prevMinutes,
    currentPos: countByPosition(currentHistory.flatMap((h) => h.techniqueIds)),
    prevPos: countByPosition(prevHistory.flatMap((h) => h.techniqueIds)),
    currentSparring,
    prevSparring,
    weaknessNames,
    improvedNames,
    hasPrev: !!prevRange,
  };
}

function fallbackSummary(ctx: SummaryContext, period: PeriodKey): string {
  const parts: string[] = [`최근 ${PERIOD_LABEL[period]} 동안 총 ${ctx.currentHistory.length}회, ${ctx.currentMinutes}분 훈련했습니다.`];
  if (ctx.hasPrev && ctx.currentHistory.length !== ctx.prevHistory.length) {
    parts.push(ctx.currentHistory.length > ctx.prevHistory.length ? '직전 같은 기간보다 훈련 횟수가 늘었습니다.' : '직전 같은 기간보다 훈련 횟수가 줄었습니다.');
  }
  if (ctx.currentSparring > 0) parts.push(`스파링 분석은 ${ctx.currentSparring}회 진행했습니다.`);
  if (ctx.weaknessNames.length) parts.push(`개선이 필요한 기술: ${ctx.weaknessNames.join(', ')}.`);
  if (ctx.improvedNames.length) parts.push(`최근 향상된 기술: ${ctx.improvedNames.join(', ')}.`);
  return parts.join(' ');
}

interface AiSummaryResponse {
  summary: string;
}

function isAiSummaryResponse(data: unknown): data is AiSummaryResponse {
  return !!data && typeof data === 'object' && typeof (data as Record<string, unknown>).summary === 'string';
}

export async function getAiTrainingSummary(period: PeriodKey): Promise<AiTrainingSummary> {
  const generatedAt = new Date().toISOString();
  const ctx = buildSummaryContext(period);

  if (ctx.currentHistory.length === 0 && ctx.currentSparring === 0) {
    return { summary: `최근 ${PERIOD_LABEL[period]} 동안의 학습 기록이 없습니다.`, source: 'fallback', generatedAt };
  }

  const positionKeys = new Set<NamedPosition>([...ctx.currentPos.keys(), ...ctx.prevPos.keys()]);
  const positionLines = [...positionKeys].map(
    (pos) => `- ${POSITION_LABEL[pos]}: 이번 기간 ${ctx.currentPos.get(pos) ?? 0}회 (직전 동일 기간 ${ctx.prevPos.get(pos) ?? 0}회)`
  );

  const contextLines = [
    `기간: 최근 ${PERIOD_LABEL[period]}`,
    `훈련 횟수: 이번 기간 ${ctx.currentHistory.length}회${ctx.hasPrev ? ` (직전 동일 기간 ${ctx.prevHistory.length}회)` : ''}`,
    `훈련 시간: 이번 기간 ${ctx.currentMinutes}분${ctx.hasPrev ? ` (직전 동일 기간 ${ctx.prevMinutes}분)` : ''}`,
    `스파링 횟수: 이번 기간 ${ctx.currentSparring}회${ctx.hasPrev ? ` (직전 동일 기간 ${ctx.prevSparring}회)` : ''}`,
    '',
    positionLines.length ? '포지션별 학습 횟수 비교:' : '',
    ...positionLines,
    '',
    ctx.weaknessNames.length ? `현재 개선이 필요한 기술: ${ctx.weaknessNames.join(', ')}` : '',
    ctx.improvedNames.length ? `최근 향상된 기술: ${ctx.improvedNames.join(', ')}` : '',
  ].filter(Boolean);

  const aiResult = await askGeminiForJson<AiSummaryResponse>({
    systemInstruction: [
      '사용자의 실제 학습 통계(이번 기간 vs 직전 동일 기간 비교)를 바탕으로 자연스러운 한국어 학습 요약을 작성하는 역할이다.',
      '아래 통계에 있는 사실만 근거로 사용하고, 통계에 없는 내용을 새로 만들어내지 않는다.',
      '2~4문장으로 간결하게 작성한다.',
      '출력 형식: {"summary": string}',
    ].join('\n'),
    contextText: contextLines.join('\n'),
    question: '이번 기간의 학습 요약을 작성해줘.',
    validate: isAiSummaryResponse,
  });

  if (aiResult.ok) return { summary: aiResult.data.summary, source: 'ai', generatedAt };
  return { summary: fallbackSummary(ctx, period), source: 'fallback', generatedAt };
}
