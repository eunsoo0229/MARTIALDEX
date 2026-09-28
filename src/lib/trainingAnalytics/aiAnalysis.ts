// 27단계 — AI 훈련 분석. Reuses the exact same Gemini transport as every
// other structured AI feature (askGeminiForJson -> aiProvider.ask -> Electron
// IPC or the gemini-ask Supabase Edge Function — never a client-held API
// key) and the shared real-data context from aiContext.ts (built on top of
// 26단계's computeTrainingReport, not a second data pipeline).
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { buildTrainingAiContext } from './aiContext';
import { computeTrainingReport } from './report';

export interface AiTrainingAnalysis {
  recentPattern: string;
  frequentTechniques: string | null;
  underTrainedAreas: string | null;
  curriculumStatus: string | null;
  nextSuggestion: string;
  source: 'ai' | 'fallback';
  generatedAt: string;
}

interface AiAnalysisResponse {
  recentPattern: string;
  frequentTechniques: string;
  underTrainedAreas: string;
  curriculumStatus: string;
  nextSuggestion: string;
}

function isAiAnalysisResponse(data: unknown): data is AiAnalysisResponse {
  if (!data || typeof data !== 'object') return false;
  const v = data as Record<string, unknown>;
  return (
    typeof v.recentPattern === 'string' &&
    typeof v.frequentTechniques === 'string' &&
    typeof v.underTrainedAreas === 'string' &&
    typeof v.curriculumStatus === 'string' &&
    typeof v.nextSuggestion === 'string'
  );
}

function fallbackAnalysis(): Omit<AiTrainingAnalysis, 'source' | 'generatedAt'> {
  const report30d = computeTrainingReport('30d');
  const recentPattern =
    report30d.trainingDays > 0
      ? `최근 30일 동안 ${report30d.trainingDays}일 훈련했으며, 총 ${report30d.totalMinutes}분을 훈련했습니다.`
      : '최근 30일 동안의 훈련 기록이 없습니다.';
  const frequentTechniques =
    report30d.topTechniques.length > 0 ? `가장 많이 훈련한 기술: ${report30d.topTechniques.map((t) => t.name).join(', ')}` : null;
  const underTrainedAreas =
    report30d.martialArtBreakdown.length >= 2
      ? `무술별 훈련 비율: ${report30d.martialArtBreakdown.map((m) => `${m.nameKo} ${m.trainingCount}회`).join(', ')}`
      : null;
  const curriculumStatus =
    report30d.curriculumCompletionRates.length > 0
      ? `진행 중인 커리큘럼: ${report30d.curriculumCompletionRates.map((c) => `${c.title} ${c.progress}%`).join(', ')}`
      : null;
  return {
    recentPattern,
    frequentTechniques,
    underTrainedAreas,
    curriculumStatus,
    nextSuggestion: '꾸준한 훈련 기록을 이어가면 더 정확한 분석을 받을 수 있습니다.',
  };
}

export async function getAiTrainingAnalysis(): Promise<AiTrainingAnalysis> {
  const generatedAt = new Date().toISOString();
  const { contextLines, hasAnyData } = buildTrainingAiContext();

  if (!hasAnyData) {
    return {
      recentPattern: '최근 30일 동안의 훈련 기록이 없습니다. 훈련을 완료하면 분석을 받을 수 있습니다.',
      frequentTechniques: null,
      underTrainedAreas: null,
      curriculumStatus: null,
      nextSuggestion: '가벼운 훈련이라도 하나 완료해보세요.',
      source: 'fallback',
      generatedAt,
    };
  }

  const aiResult = await askGeminiForJson<AiAnalysisResponse>({
    systemInstruction: [
      '사용자의 실제 훈련 데이터를 근거로 훈련 패턴을 분석하는 역할이다.',
      '아래 제공된 실제 데이터에 있는 사실만 근거로 사용하고, 데이터에 없는 내용을 새로 만들어내지 않는다.',
      '데이터가 없는 항목은 "기록이 없습니다" 등으로 솔직하게 표현한다.',
      '절대로 의료적 진단, 부상 판단, 통증 원인 추정을 하지 않는다. 그런 질문처럼 보이더라도 훈련 기록 분석으로만 답한다.',
      '각 필드는 1~2문장의 자연스러운 한국어로 작성한다.',
      '출력 형식: {"recentPattern": string, "frequentTechniques": string, "underTrainedAreas": string, "curriculumStatus": string, "nextSuggestion": string}',
    ].join('\n'),
    contextText: contextLines.join('\n'),
    question: '위 실제 훈련 데이터를 바탕으로 최근 훈련 패턴, 자주 훈련하는 기술, 상대적으로 적게 훈련한 영역, 현재 커리큘럼 진행 상황, 다음 훈련 방향을 분석해줘.',
    validate: isAiAnalysisResponse,
  });

  if (aiResult.ok) {
    return {
      recentPattern: aiResult.data.recentPattern,
      frequentTechniques: aiResult.data.frequentTechniques || null,
      underTrainedAreas: aiResult.data.underTrainedAreas || null,
      curriculumStatus: aiResult.data.curriculumStatus || null,
      nextSuggestion: aiResult.data.nextSuggestion,
      source: 'ai',
      generatedAt,
    };
  }

  return { ...fallbackAnalysis(), source: 'fallback', generatedAt };
}
