// "1. MMA 전용 AI 분석" — narrates a "부족한 영역" judgment the same
// "compute the real numbers first, then ask Gemini to narrate only those
// numbers" way as 27단계's trainingAnalytics/aiAnalysis.ts. Nothing here
// lets the AI invent an area or a technique; classifyMmaArea only ever
// labels techniques that are already real (either matched from the user's
// goal text via the existing techniqueMatcher, or already in the user's own
// trainingHistory).
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { getTechniquesByIds } from '../loadData';
import { listTrainingHistory } from '../trainingHistory/service';
import { classifyMmaArea } from './areaClassifier';
import { MMA_AREA_LABEL, MMA_SOURCE_MARTIAL_ARTS, type MmaArea } from './types';
import type { GoalTechniqueMatch } from '../aiCurriculum/types';

export interface MmaAreaBreakdown {
  area: MmaArea;
  label: string;
  matchedTechniqueCount: number; // from the current goal-matched pool
  trainedCount: number; // from the user's real trainingHistory, MMA-relevant techniques only
}

export interface MmaAreaAnalysis {
  breakdown: MmaAreaBreakdown[];
  underrepresentedAreas: string;
  wellCoveredAreas: string | null;
  source: 'ai' | 'fallback';
}

function computeAreaBreakdown(matches: GoalTechniqueMatch[]): MmaAreaBreakdown[] {
  const matchedTechniques = getTechniquesByIds(matches.map((m) => m.techniqueId));
  const matchedCounts = new Map<MmaArea, number>();
  for (const t of matchedTechniques) {
    const area = classifyMmaArea(t);
    if (area) matchedCounts.set(area, (matchedCounts.get(area) ?? 0) + 1);
  }

  const trainedTechniqueIds = new Set(
    listTrainingHistory()
      .filter((h) => h.completed)
      .flatMap((h) => h.techniqueIds)
  );
  const trainedTechniques = getTechniquesByIds([...trainedTechniqueIds]).filter((t) => MMA_SOURCE_MARTIAL_ARTS.includes(t.martialArt));
  const trainedCounts = new Map<MmaArea, number>();
  for (const t of trainedTechniques) {
    const area = classifyMmaArea(t);
    if (area) trainedCounts.set(area, (trainedCounts.get(area) ?? 0) + 1);
  }

  return (Object.keys(MMA_AREA_LABEL) as MmaArea[]).map((area) => ({
    area,
    label: MMA_AREA_LABEL[area],
    matchedTechniqueCount: matchedCounts.get(area) ?? 0,
    trainedCount: trainedCounts.get(area) ?? 0,
  }));
}

interface AiAreaResponse {
  underrepresentedAreas: string;
  wellCoveredAreas: string;
}

function isAiAreaResponse(data: unknown): data is AiAreaResponse {
  if (!data || typeof data !== 'object') return false;
  const v = data as Record<string, unknown>;
  return typeof v.underrepresentedAreas === 'string' && typeof v.wellCoveredAreas === 'string';
}

function fallbackNarration(breakdown: MmaAreaBreakdown[]): { underrepresentedAreas: string; wellCoveredAreas: string | null } {
  const withContent = breakdown.filter((b) => b.matchedTechniqueCount > 0 || b.trainedCount > 0);
  const under = breakdown.filter((b) => b.matchedTechniqueCount === 0 && b.trainedCount === 0).map((b) => b.label);
  const well = withContent.filter((b) => b.trainedCount >= 3).map((b) => b.label);
  return {
    underrepresentedAreas: under.length > 0 ? `실제 데이터 기준으로 ${under.join(', ')} 영역의 훈련 기록/매칭 기술이 없습니다.` : '모든 영역에 어느 정도의 기술 데이터가 있습니다.',
    wellCoveredAreas: well.length > 0 ? `${well.join(', ')} 영역은 이미 여러 번 훈련한 기록이 있습니다.` : null,
  };
}

export async function getMmaAreaAnalysis(matches: GoalTechniqueMatch[], userText: string): Promise<MmaAreaAnalysis> {
  const breakdown = computeAreaBreakdown(matches);
  const contextLines = breakdown.map((b) => `${b.label}: 이번 목표에 매칭된 기술 ${b.matchedTechniqueCount}개, 실제 훈련 기록 ${b.trainedCount}회`);

  const aiResult = await askGeminiForJson<AiAreaResponse>({
    systemInstruction: [
      'MMA(종합격투기) 학습자의 영역별(Striking/Clinch/Takedown/Takedown Defense/Ground/Submission/Ground & Pound/Transition) 실제 데이터를 보고',
      '부족한 영역과 충분한 영역을 판단하는 역할이다.',
      '아래 제공된 실제 수치(매칭된 기술 수, 실제 훈련 횟수)에 있는 사실만 근거로 사용하고, 없는 데이터를 만들어내지 않는다.',
      '의료적 진단이나 부상 판단은 절대 하지 않는다.',
      '출력 형식: {"underrepresentedAreas": string, "wellCoveredAreas": string}',
    ].join('\n'),
    contextText: [`사용자 요청: "${userText}"`, '', ...contextLines].join('\n'),
    question: '위 실제 영역별 데이터를 바탕으로 부족한 영역과 충분한 영역을 한국어로 요약해줘.',
    validate: isAiAreaResponse,
  });

  if (aiResult.ok) {
    return { breakdown, underrepresentedAreas: aiResult.data.underrepresentedAreas, wellCoveredAreas: aiResult.data.wellCoveredAreas || null, source: 'ai' };
  }
  const fallback = fallbackNarration(breakdown);
  return { breakdown, ...fallback, source: 'fallback' };
}
