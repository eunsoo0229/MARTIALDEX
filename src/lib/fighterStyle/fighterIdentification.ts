import { askGeminiForJson, type GeminiJsonOutcome } from './geminiJson';
import type { FighterCandidate } from './types';

export interface ExtractedQuery {
  fighterNameGuess: string;
  styleQuery: string | null;
  goal: string | null;
}

function isExtractedQuery(data: unknown): data is ExtractedQuery {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.fighterNameGuess === 'string' && d.fighterNameGuess.trim().length > 0;
}

// Free-text -> {fighterNameGuess, styleQuery, goal}. The user never has to
// type a well-formed sentence — "마카체프", "마카체프 스타일", "마카체프처럼
// 싸우고 싶어" all funnel through here.
export async function extractFighterQuery(freeText: string): Promise<GeminiJsonOutcome<ExtractedQuery>> {
  return askGeminiForJson<ExtractedQuery>({
    systemInstruction: [
      '사용자가 격투기 선수의 스타일을 배우고 싶다는 문장을 자유롭게 입력한다.',
      '이 문장에서 (1) 선수 이름 추정값(fighterNameGuess, 가능하면 영문 표기), (2) 사용자가 특별히',
      '언급한 스타일 요소(styleQuery, 예: "그래플링", "거리 조절" — 없으면 null),',
      '(3) 사용자의 학습 목표(goal, 예: "그처럼 싸우고 싶다" — 없으면 null)를 추출한다.',
      '선수 이름을 전혀 알아볼 수 없으면 fighterNameGuess에 원문 입력을 그대로 넣는다.',
      '출력 형식: {"fighterNameGuess": string, "styleQuery": string|null, "goal": string|null}',
    ].join('\n'),
    contextText: '',
    question: `사용자 입력: "${freeText}"`,
    validate: isExtractedQuery,
  });
}

interface CandidatesResponse {
  candidates: FighterCandidate[];
}

function isCandidatesResponse(data: unknown): data is CandidatesResponse {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.candidates)) return false;
  return d.candidates.every(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof (c as any).id === 'string' &&
      typeof (c as any).name === 'string' &&
      typeof (c as any).sport === 'string' &&
      typeof (c as any).shortDescription === 'string'
  );
}

// Given a name guess, ask Gemini which REAL, well-known combat-sports
// athletes it could plausibly refer to (handles both "동명이인" and typos/
// partial names). Explicitly instructed to return an empty list rather than
// invent someone — see buildEmptyState handling at the call site.
export async function identifyFighterCandidates(nameGuess: string): Promise<GeminiJsonOutcome<CandidatesResponse>> {
  return askGeminiForJson<CandidatesResponse>({
    systemInstruction: [
      '사용자가 입력한 이름과 일치하거나 비슷한, 실제로 존재하며 공개적으로 잘 알려진 격투기/',
      '무술 선수(UFC, 복싱, 레슬링, 유도, BJJ, 킥복싱, 무에타이, 태권도 등)를 최대 3명까지 찾는다.',
      '확실하지 않거나 실제 인물인지 알 수 없으면 candidates를 빈 배열로 반환한다 — 존재를 지어내지 않는다.',
      '각 후보의 id는 영문 소문자와 하이픈만 사용한 slug(예: "islam-makhachev")로 만든다.',
      'shortDescription은 한 문장, 이미 잘 알려진 일반적인 사실(주요 체급/소속 단체/스타일 별명 정도)만',
      '적고 특정 경기 결과나 전적 숫자처럼 확인이 어려운 구체적 사실은 넣지 않는다.',
      '출력 형식: {"candidates": [{"id": string, "name": string, "sport": string, "shortDescription": string}]}',
    ].join('\n'),
    contextText: '',
    question: `이름 추정값: "${nameGuess}"`,
    validate: isCandidatesResponse,
  });
}
