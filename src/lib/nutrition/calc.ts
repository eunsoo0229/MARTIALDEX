import type { NutritionFoodItem, NutritionGoalType, NutritionMealEntry } from './types';

export interface MacroTotals {
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
}

const ZERO_TOTALS: MacroTotals = { calories: 0, carbsG: 0, proteinG: 0, fatG: 0 };

/** The single place every calorie/macro sum in this module goes through — mirrors gymTraining/volume.ts's centralization pattern so every screen (메인/캘린더/통합 대시보드) agrees on the same numbers. */
export function sumFoodTotals(foods: NutritionFoodItem[]): MacroTotals {
  return foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number.isFinite(f.calories) ? f.calories : 0),
      carbsG: acc.carbsG + (Number.isFinite(f.carbsG) ? f.carbsG : 0),
      proteinG: acc.proteinG + (Number.isFinite(f.proteinG) ? f.proteinG : 0),
      fatG: acc.fatG + (Number.isFinite(f.fatG) ? f.fatG : 0),
    }),
    { ...ZERO_TOTALS }
  );
}

export function sumMealTotals(meal: NutritionMealEntry): MacroTotals {
  return sumFoodTotals(meal.foods);
}

export function sumMealsTotals(meals: NutritionMealEntry[]): MacroTotals {
  return meals.reduce(
    (acc, m) => {
      const t = sumMealTotals(m);
      return { calories: acc.calories + t.calories, carbsG: acc.carbsG + t.carbsG, proteinG: acc.proteinG + t.proteinG, fatG: acc.fatG + t.fatG };
    },
    { ...ZERO_TOTALS }
  );
}

export type GoalStatus = 'under' | 'met' | 'over' | 'no_goal';

/**
 * "목표 칼로리 달성 상태" (item 7) — meaning depends on goal type, never a
 * blanket "적게=좋음"/"많이=좋음" judgment:
 *   - lose: at-or-under goal counts as "met" (the point of a deficit goal).
 *   - gain: at-or-over goal counts as "met".
 *   - maintain: within a tolerance BAND around the goal counts as "met" —
 *     narrower window since both directions matter equally.
 * Returns 'no_goal' when no calorieGoal is set, so a caller never has to
 * guess whether a numeric result means "0 calories short" vs "no goal exists".
 */
export function computeCalorieGoalStatus(goalType: NutritionGoalType, consumedKcal: number, calorieGoal: number | null): GoalStatus {
  if (calorieGoal == null || calorieGoal <= 0) return 'no_goal';
  if (goalType === 'lose') return consumedKcal <= calorieGoal ? 'met' : 'over';
  if (goalType === 'gain') return consumedKcal >= calorieGoal ? 'met' : 'under';
  // maintain — a symmetric ±5% band around the goal.
  const tolerance = calorieGoal * 0.05;
  if (consumedKcal < calorieGoal - tolerance) return 'under';
  if (consumedKcal > calorieGoal + tolerance) return 'over';
  return 'met';
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  under: '목표 이하',
  met: '목표 달성',
  over: '목표 초과',
  no_goal: '목표 미설정',
};

/**
 * "감량 목표 달성 시 노란색" 등 캘린더 강조 — same goal-type-aware status
 * above, exposed as a boolean so calendar rendering doesn't need to know the
 * goal-type semantics itself.
 */
export function isCalorieGoalAchieved(goalType: NutritionGoalType, consumedKcal: number, calorieGoal: number | null): boolean {
  return computeCalorieGoalStatus(goalType, consumedKcal, calorieGoal) === 'met';
}

export function formatKcal(kcal: number): string {
  return `${Math.round(kcal).toLocaleString('ko-KR')}kcal`;
}
