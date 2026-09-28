import { aiProvider } from '../ai/provider';
import type { AiErrorCode, AiImagePart } from '../ai/types';

// Every structured (non-chat) Gemini call in the fighter-style feature goes
// through here — reuses the exact same IPC path as the chat feature
// (aiProvider.ask -> window.martialdex.askAi -> electron/gemini.cjs), just
// with history always empty (these are one-shot extraction calls, not a
// conversation) and the response parsed as JSON instead of shown as chat
// text. No new IPC channel, no new API key handling.
export type GeminiJsonOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; code: AiErrorCode | 'PARSE_ERROR'; message: string };

const JSON_MODE_PREAMBLE =
  '당신은 JSON만 반환하는 백엔드 API입니다. 마크다운 코드 펜스(```), 설명 문장, 인사말 없이 ' +
  '요청받은 JSON 객체 또는 배열 하나만 출력하세요. 다른 텍스트를 앞뒤에 절대 붙이지 마세요.';

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export async function askGeminiForJson<T>(params: {
  /** Task-specific instructions — the JSON-only preamble is added automatically. */
  systemInstruction: string;
  /** Real app data / grounding context, same role as elsewhere in src/lib/ai/context.ts. */
  contextText: string;
  question: string;
  validate?: (data: unknown) => data is T;
  /** 음식 사진 분석(nutrition/aiPhotoAnalysis.ts) 전용 — undefined인 다른 모든 호출부는 그대로 텍스트 전용. */
  imageParts?: AiImagePart[];
}): Promise<GeminiJsonOutcome<T>> {
  const result = await aiProvider.ask({
    systemInstruction: `${JSON_MODE_PREAMBLE}\n\n${params.systemInstruction}`,
    contextText: params.contextText,
    history: [],
    question: params.question,
    imageParts: params.imageParts,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(result.text));
  } catch {
    return {
      ok: false,
      code: 'PARSE_ERROR',
      message: 'AI 응답을 이해할 수 없었습니다. 잠시 후 다시 시도해주세요.',
    };
  }

  if (params.validate && !params.validate(parsed)) {
    return {
      ok: false,
      code: 'PARSE_ERROR',
      message: 'AI 응답 형식이 올바르지 않았습니다. 잠시 후 다시 시도해주세요.',
    };
  }

  return { ok: true, data: parsed as T };
}
