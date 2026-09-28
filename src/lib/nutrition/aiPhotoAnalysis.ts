import { askGeminiForJson, type GeminiJsonOutcome } from '../fighterStyle/geminiJson';
import type { NutritionFoodItem } from './types';

export interface PhotoAnalysisResult {
  foods: NutritionFoodItem[];
}

function isFoodItem(d: unknown): d is NutritionFoodItem {
  if (!d || typeof d !== 'object') return false;
  const f = d as Record<string, unknown>;
  return (
    typeof f.name === 'string' &&
    typeof f.amount === 'string' &&
    typeof f.calories === 'number' &&
    typeof f.carbsG === 'number' &&
    typeof f.proteinG === 'number' &&
    typeof f.fatG === 'number'
  );
}

function isPhotoAnalysisResult(d: unknown): d is PhotoAnalysisResult {
  if (!d || typeof d !== 'object') return false;
  const p = d as Record<string, unknown>;
  return Array.isArray(p.foods) && p.foods.every(isFoodItem);
}

/**
 * "AI 음식 사진 분석" (item 5) — the only nutrition AI feature that needs
 * Gemini's image input, so it's the only caller that passes imageParts
 * through to askGeminiForJson (see ai/types.ts's AskAiRequest.imageParts,
 * threaded through electron/gemini.cjs and supabase/functions/gemini-ask).
 * A photo alone can never precisely measure real intake, so every result
 * must be shown as "AI 추정값" and stay editable — never auto-saved (same
 * confirm/edit contract as aiMealGen.ts/aiMealParse.ts).
 */
export async function analyzeMealPhoto(input: { mimeType: string; base64Data: string }): Promise<GeminiJsonOutcome<PhotoAnalysisResult>> {
  return askGeminiForJson<PhotoAnalysisResult>({
    systemInstruction: [
      '첨부된 음식 사진을 분석해서 사진에 보이는 음식들을 구조화된 데이터로 변환한다.',
      '각 음식에 대해 이름/예상 섭취량(자유 형식 문자열, 예: "1공기", "200g")/예상 칼로리/탄수화물(g)/단백질(g)/지방(g)을 추정한다.',
      '사진만으로는 실제 조리법, 재료, 정확한 섭취량을 알 수 없으므로 항상 일반적으로 알려진 정보를 바탕으로 한 추정값임을 전제로 한다.',
      '사진에서 무엇인지 확신할 수 없는 음식은 억지로 추정해 만들어내지 말고 목록에서 제외한다 — 사용자가 직접 추가/수정할 수 있다.',
      '출력 형식: {"foods": [{"name":string,"amount":string,"calories":number,"carbsG":number,"proteinG":number,"fatG":number}, ...]}',
    ].join('\n'),
    contextText: '',
    question: '이 사진에 있는 음식을 분석해줘.',
    validate: isPhotoAnalysisResult,
    imageParts: [{ mimeType: input.mimeType, data: input.base64Data }],
  });
}
