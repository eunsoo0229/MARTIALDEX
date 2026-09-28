import { askGeminiForJson, type GeminiJsonOutcome } from '../fighterStyle/geminiJson';
import type { MealType, NutritionFoodItem } from './types';

export type GeneratedMealPlan = Record<MealType, NutritionFoodItem[]>;

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

function isMealPlan(d: unknown): d is GeneratedMealPlan {
  if (!d || typeof d !== 'object') return false;
  const p = d as Record<string, unknown>;
  return (['breakfast', 'lunch', 'dinner', 'snack'] as const).every((k) => Array.isArray(p[k]) && (p[k] as unknown[]).every(isFoodItem));
}

/**
 * "AI 식단 생성" (item 3) — reuses the exact same askGeminiForJson helper
 * every other structured Gemini feature in this app already uses (16
 * existing consumers, see fighterStyle/geminiJson.ts) — no new AI-calling
 * path. Every value in the result is an AI estimate, never a real
 * measurement; the caller (RequestGymExercise-style preview screen) must
 * label it as such before letting the user save it as their own meal.
 */
export async function generateMealPlan(input: {
  goalDescription: string;
  calorieGoal?: number | null;
  carbGoalG?: number | null;
  proteinGoalG?: number | null;
  fatGoalG?: number | null;
}): Promise<GeminiJsonOutcome<GeneratedMealPlan>> {
  const goalContext = [
    input.calorieGoal != null ? `목표 칼로리 ${input.calorieGoal}kcal` : null,
    input.carbGoalG != null ? `탄수화물 목표 ${input.carbGoalG}g` : null,
    input.proteinGoalG != null ? `단백질 목표 ${input.proteinGoalG}g` : null,
    input.fatGoalG != null ? `지방 목표 ${input.fatGoalG}g` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return askGeminiForJson<GeneratedMealPlan>({
    systemInstruction: [
      '사용자의 요청에 맞춰 하루 식단(아침/점심/저녁/간식)을 한국 음식 위주로 구성한다.',
      '각 식사는 음식 배열이며, 각 음식은 이름/예상 섭취량(자유 형식 문자열, 예: "1공기", "200g")/예상 칼로리/탄수화물(g)/단백질(g)/지방(g)을 포함한다.',
      '실제 측정값이 아니라 일반적으로 알려진 정보를 바탕으로 한 추정값임을 항상 전제로 한다 — 확신 없는 음식을 억지로 만들어내지 않는다.',
      '간식이 필요 없다고 판단되면 빈 배열로 둔다.',
      '출력 형식: {"breakfast": [{"name":string,"amount":string,"calories":number,"carbsG":number,"proteinG":number,"fatG":number}, ...], "lunch": [...], "dinner": [...], "snack": [...]}',
    ].join('\n'),
    contextText: goalContext || '특별한 칼로리/영양 목표가 설정되어 있지 않습니다.',
    question: input.goalDescription,
    validate: isMealPlan,
  });
}
