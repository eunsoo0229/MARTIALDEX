import type { NutritionMealEntry, NutritionGoalType } from './types';
import type { NutritionCalendarDay } from '../../components/NutritionCalendarView';
import { isCalorieGoalAchieved, sumMealsTotals } from './calc';

/** month is 0-indexed (JS Date convention), mirroring trainingAnalytics/calendarData.ts's computeCalendarMonth. */
export function computeNutritionCalendarMonth(
  meals: NutritionMealEntry[],
  year: number,
  month: number,
  goalType: NutritionGoalType,
  calorieGoal: number | null
): NutritionCalendarDay[] {
  const byDate = new Map<string, NutritionMealEntry[]>();
  for (const m of meals) {
    const list = byDate.get(m.date) ?? [];
    list.push(m);
    byDate.set(m.date, list);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: NutritionCalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayMeals = byDate.get(dateKey) ?? [];
    const hasEntries = dayMeals.length > 0;
    const consumed = hasEntries ? sumMealsTotals(dayMeals).calories : 0;
    const goalMet = hasEntries && isCalorieGoalAchieved(goalType, consumed, calorieGoal);
    result.push({ dateKey, hasEntries, goalMet });
  }
  return result;
}
