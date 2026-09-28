import { aiProvider } from '../ai/provider';
import type { AiErrorCode, GroundingSource } from '../ai/types';

// Same JSON-mode wrapper pattern as fighterStyle/geminiJson.ts (kept as its
// own copy, not imported, so this feature's Gemini plumbing stays
// independent — see aiCurriculum/ for the same design choice) but also
// forwards useSearchGrounding/groundingSources, which the fighterStyle/
// aiCurriculum features never needed.
export type GeminiJsonOutcome<T> =
  | { ok: true; data: T; groundingSources: GroundingSource[]; usedSearchGrounding: boolean; webSearchQueries: string[] }
  | { ok: false; code: AiErrorCode | 'PARSE_ERROR'; message: string };

const JSON_MODE_PREAMBLE =
  '당신은 JSON만 반환하는 백엔드 API입니다. 마크다운 코드 펜스(```), 설명 문장, 인사말 없이 ' +
  '요청받은 JSON 객체 또는 배열 하나만 출력하세요. 다른 텍스트를 앞뒤에 절대 붙이지 마세요.';

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export async function askGeminiForJsonWithGrounding<T>(params: {
  systemInstruction: string;
  contextText: string;
  question: string;
  useSearchGrounding?: boolean;
  validate?: (data: unknown) => data is T;
}): Promise<GeminiJsonOutcome<T>> {
  const result = await aiProvider.ask({
    systemInstruction: `${JSON_MODE_PREAMBLE}\n\n${params.systemInstruction}`,
    contextText: params.contextText,
    history: [],
    question: params.question,
    useSearchGrounding: params.useSearchGrounding,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(result.text));
  } catch {
    return { ok: false, code: 'PARSE_ERROR', message: 'AI 응답을 이해할 수 없었습니다. 잠시 후 다시 시도해주세요.' };
  }

  if (params.validate && !params.validate(parsed)) {
    return { ok: false, code: 'PARSE_ERROR', message: 'AI 응답 형식이 올바르지 않았습니다. 잠시 후 다시 시도해주세요.' };
  }

  return {
    ok: true,
    data: parsed as T,
    groundingSources: result.groundingSources ?? [],
    usedSearchGrounding: !!params.useSearchGrounding,
    webSearchQueries: result.webSearchQueries ?? [],
  };
}
