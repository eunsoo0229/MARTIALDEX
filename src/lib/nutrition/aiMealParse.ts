import { askGeminiForJson, type GeminiJsonOutcome } from '../fighterStyle/geminiJson';
import type { MealType, NutritionFoodItem } from './types';

export interface ParsedMeal {
  mealType: MealType;
  foods: NutritionFoodItem[];
}

const VALID_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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

function isParsedMeal(d: unknown): d is ParsedMeal {
  if (!d || typeof d !== 'object') return false;
  const p = d as Record<string, unknown>;
  return typeof p.mealType === 'string' && VALID_MEAL_TYPES.includes(p.mealType as MealType) && Array.isArray(p.foods) && p.foods.every(isFoodItem);
}

/**
 * "자연어 식사 입력" (item 6) — e.g. "오늘 점심에 김치찌개 한 그릇이랑 밥 한
 * 공기 먹었어." → structured food items. Same askGeminiForJson helper as
 * aiMealGen.ts/every other structured Gemini call in the app. The result is
 * NEVER auto-saved — every call site must route it through the same
 * confirm/edit UI as a manually-entered meal before it's persisted (item 6:
 * "변환 결과를 바로 확정하지 말고 사용자가 확인/수정한 뒤 저장").
 */
export async function parseMealFromText(text: string): Promise<GeminiJsonOutcome<ParsedMeal>> {
  return askGeminiForJson<ParsedMeal>({
    systemInstruction: [
      '사용자가 자연어로 설명한 식사 내용을 분석해서 구조화된 식사 데이터로 변환한다.',
      'mealType은 다음 중 하나: "breakfast"(아침), "lunch"(점심), "dinner"(저녁), "snack"(간식) — 문맥에서 명확하지 않으면 가장 가능성 높은 것을 고른다.',
      'foods는 언급된 각 음식에 대해 이름/예상 섭취량(자유 형식 문자열)/예상 칼로리/탄수화물(g)/단백질(g)/지방(g)을 포함한다.',
      '실제 측정값이 아니라 일반적으로 알려진 정보를 바탕으로 한 추정값임을 전제로 하며, 언급되지 않은 음식을 지어내지 않는다.',
      '출력 형식: {"mealType": string, "foods": [{"name":string,"amount":string,"calories":number,"carbsG":number,"proteinG":number,"fatG":number}, ...]}',
    ].join('\n'),
    contextText: '',
    question: text,
    validate: isParsedMeal,
  });
}
