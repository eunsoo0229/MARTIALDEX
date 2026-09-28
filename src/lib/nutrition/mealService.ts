import type { MealSource, MealType, NutritionFoodItem, NutritionMealEntry } from './types';
import { nutritionMealRepository } from './mealRepository';
import { todayDateKey } from '../dateUtil';

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function addMeal(input: {
  date?: string;
  mealType: MealType;
  foods: NutritionFoodItem[];
  source: MealSource;
  notes?: string | null;
}): NutritionMealEntry {
  const now = new Date().toISOString();
  const entry: NutritionMealEntry = {
    id: newId(),
    date: input.date ?? todayDateKey(),
    mealType: input.mealType,
    foods: input.foods,
    source: input.source,
    isEstimate: input.source !== 'manual',
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  nutritionMealRepository.add(entry);
  return entry;
}

export function updateMeal(id: string, patch: Partial<Pick<NutritionMealEntry, 'mealType' | 'foods' | 'notes'>>): NutritionMealEntry | undefined {
  return nutritionMealRepository.update(id, patch);
}

export function deleteMeal(id: string): void {
  nutritionMealRepository.remove(id);
}

export function listAllMeals(): NutritionMealEntry[] {
  return nutritionMealRepository.list();
}

export function listMealsForDate(date: string): NutritionMealEntry[] {
  return listAllMeals().filter((m) => m.date === date);
}

export function listMealsForToday(): NutritionMealEntry[] {
  return listMealsForDate(todayDateKey());
}

export function getMeal(id: string): NutritionMealEntry | undefined {
  return nutritionMealRepository.get(id);
}
