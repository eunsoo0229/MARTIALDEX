// 29단계 — AI Personal Combat Coach. Same Gemini transport (askGeminiForJson
// -> aiProvider.ask, no client-held API key) and the same shared real-data
// context (buildTrainingAiContext, built on 26단계's Training Analytics
// report) as 27단계's AI 훈련 분석 — this module supplies its own
// natural-language question + recommendation shape on top of that shared
// base, never a second data pipeline.
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { searchAllTechniques } from '../userTechniques/service';
import { buildTrainingAiContext } from '../trainingAnalytics/aiContext';
import { martialArtSummaries } from '../loadData';
import { MMA_MARTIAL_ART_ID } from '../mmaCurriculum/types';
import type { Technique } from '../../types';

const VALID_MARTIAL_ART_IDS = new Set([...martialArtSummaries.map((a) => a.id), MMA_MARTIAL_ART_ID]);

export interface PersonalCoachResult {
  analysisSummary: string;
  /** Real technique objects only — every id here resolves through the same catalog search used across the app (searchAllTechniques), never trusted directly from the AI response. */
  recommendedTechniques: Technique[];
  recommendedTraining: string;
  underTrainedAreas: string | null;
  curriculumDirection: string;
  nextTraining: string;
  /** Ready-made free-text goal for AiGoalCurriculum's own input — handing the user's request off to the EXISTING curriculum generator rather than building a second one. */
  curriculumGoalText: string;
  /** Set only when the user's text clearly names a martial art (including "mma") — lets the curriculum handoff pre-select the right dropdown option instead of always defaulting to the first art. */
  suggestedMartialArt: string | null;
  source: 'ai' | 'fallback';
  generatedAt: string;
}

interface AiRecommendationResponse {
  analysisSummary: string;
  /** Free-text technique names/phrases (Korean or English) — matched against the real catalog afterward, never used as-is. */
  techniqueQueries: string[];
  recommendedTraining: string;
  underTrainedAreas: string;
  curriculumDirection: string;
  nextTraining: string;
  curriculumGoalText: string;
  suggestedMartialArt: string | null;
}

function isAiRecommendationResponse(data: unknown): data is AiRecommendationResponse {
  if (!data || typeof data !== 'object') return false;
  const v = data as Record<string, unknown>;
  return (
    typeof v.analysisSummary === 'string' &&
    Array.isArray(v.techniqueQueries) &&
    typeof v.recommendedTraining === 'string' &&
    typeof v.underTrainedAreas === 'string' &&
    typeof v.curriculumDirection === 'string' &&
    typeof v.nextTraining === 'string' &&
    typeof v.curriculumGoalText === 'string' &&
    (v.suggestedMartialArt === null || typeof v.suggestedMartialArt === 'string')
  );
}

const MAX_RECOMMENDED_TECHNIQUES = 8;

function resolveRealTechniques(queries: string[]): Technique[] {
  const seen = new Set<string>();
  const result: Technique[] = [];
  for (const q of queries) {
    if (typeof q !== 'string' || !q.trim()) continue;
    for (const t of searchAllTechniques(q.trim(), 3)) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(t);
      if (result.length >= MAX_RECOMMENDED_TECHNIQUES) return result;
    }
  }
  return result;
}

function fallbackResult(userText: string): Omit<PersonalCoachResult, 'source' | 'generatedAt'> {
  return {
    analysisSummary: '지금은 AI 분석을 불러올 수 없어, 입력하신 내용을 그대로 커리큘럼 생성에 활용할 수 있도록 준비했습니다.',
    recommendedTechniques: [],
    recommendedTraining: '아래 "이 추천으로 커리큘럼 만들기"를 눌러 직접 커리큘럼을 만들어보세요.',
    underTrainedAreas: null,
    curriculumDirection: '입력하신 목표를 바탕으로 AI 맞춤 커리큘럼에서 계속 진행할 수 있습니다.',
    nextTraining: '가벼운 훈련부터 시작해보세요.',
    curriculumGoalText: userText,
    suggestedMartialArt: null,
  };
}

export async function getPersonalCoachRecommendation(userText: string): Promise<PersonalCoachResult> {
  const generatedAt = new Date().toISOString();
  const { contextLines } = buildTrainingAiContext();

  const aiResult = await askGeminiForJson<AiRecommendationResponse>({
    systemInstruction: [
      '당신은 MARTIALDEX 앱의 AI Personal Combat Coach다. 사용자가 자연어로 말하는 훈련 목표나 부족한 부분을 듣고, 실제 저장된 훈련 데이터를 근거로 개인화된 추천을 제공한다.',
      '아래 제공된 실제 데이터에 있는 사실만 근거로 사용하고, 데이터에 없는 내용을 사실처럼 추측해서 말하지 않는다. 데이터가 부족하면 그 사실을 솔직하게 언급한다.',
      'techniqueQueries에는 실제 무술 기술을 가리키는 짧은 검색어(한글 또는 영어 기술명, 예: "잽", "더블 레그", "가드 패스")만 넣는다. 존재를 확신할 수 없는 기술명을 지어내지 않는다 — 검색어일 뿐이며 실제 매칭은 앱이 수행한다.',
      'curriculumGoalText는 AI 맞춤 커리큘럼 생성 화면에 그대로 입력할 수 있는 한국어 목표 문장 1~2개로 작성한다.',
      `사용자 요청에서 특정 무술이 명확히 드러나면 suggestedMartialArt에 다음 id 중 하나를 넣는다: ${[...VALID_MARTIAL_ART_IDS].join(', ')} ("mma"는 종합격투기/MMA를 의미한다). 명확하지 않으면 null.`,
      '의료적 진단, 부상 판단, 통증 원인 추정은 절대 하지 않는다.',
      '출력 형식: {"analysisSummary": string, "techniqueQueries": string[], "recommendedTraining": string, "underTrainedAreas": string, "curriculumDirection": string, "nextTraining": string, "curriculumGoalText": string, "suggestedMartialArt": string | null}',
    ].join('\n'),
    contextText: [...contextLines, '', `사용자의 요청: "${userText}"`].join('\n'),
    question: '위 사용자의 요청과 실제 훈련 데이터를 바탕으로 추천을 제공해줘.',
    validate: isAiRecommendationResponse,
  });

  if (aiResult.ok) {
    return {
      analysisSummary: aiResult.data.analysisSummary,
      recommendedTechniques: resolveRealTechniques(aiResult.data.techniqueQueries),
      recommendedTraining: aiResult.data.recommendedTraining,
      underTrainedAreas: aiResult.data.underTrainedAreas || null,
      curriculumDirection: aiResult.data.curriculumDirection,
      nextTraining: aiResult.data.nextTraining,
      curriculumGoalText: aiResult.data.curriculumGoalText || userText,
      suggestedMartialArt: aiResult.data.suggestedMartialArt && VALID_MARTIAL_ART_IDS.has(aiResult.data.suggestedMartialArt) ? aiResult.data.suggestedMartialArt : null,
      source: 'ai',
      generatedAt,
    };
  }

  return { ...fallbackResult(userText), source: 'fallback', generatedAt };
}
