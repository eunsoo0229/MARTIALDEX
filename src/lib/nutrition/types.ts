// 영양/식단 관리 — a fully new, additive module. Nothing here reuses or
// modifies any existing training/curriculum/technique type; it links to the
// training system only by reading trainingHistory entries (read-only) and
// by reusing gymTraining/weightCalc.ts's calculateSetVolumeKg for gym
// energy estimates (see trainingEnergy.ts). No existing table/type/route is
// changed by this module's existence.

export type NutritionGoalType = 'lose' | 'gain' | 'maintain';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Gender = 'male' | 'female';

/**
 * One user's nutrition goals + the body metrics needed for a BMR estimate.
 * Singleton per user (not a list) — same "one row per user" shape as
 * `profiles` (see supabase/migrations/0001_profiles.sql), stored under its
 * own key/table rather than added as columns to `profiles` so this
 * genuinely new feature never risks the existing profiles migration/trigger.
 *
 * Every body-metric field is optional and never defaulted to a fabricated
 * value — a BMR estimate simply isn't shown until they're all present (see
 * bmr.ts). `bodyWeightKg` is a SEPARATE, Supabase-synced field from
 * gymTraining/weightCalc.ts's local-only `getUserBodyweightKg()` (that one
 * stays local-only, used only for gym set-input math) — this screen
 * pre-fills from it as a courtesy default, but the two are independent
 * going forward so neither system's behavior changes underneath it.
 */
export interface NutritionProfile {
  goalType: NutritionGoalType;
  calorieGoal: number | null;
  carbGoalG: number | null;
  proteinGoalG: number | null;
  fatGoalG: number | null;
  heightCm: number | null;
  age: number | null;
  gender: Gender | null;
  bodyWeightKg: number | null;
  updatedAt: string;
}

export function createDefaultNutritionProfile(): NutritionProfile {
  return {
    goalType: 'maintain',
    calorieGoal: null,
    carbGoalG: null,
    proteinGoalG: null,
    fatGoalG: null,
    heightCm: null,
    age: null,
    gender: null,
    bodyWeightKg: null,
    updatedAt: new Date().toISOString(),
  };
}

/** One food item within a meal. Amount is free text ("1공기", "200g", "1개") since real portions vary far more than a single unit can capture. */
export interface NutritionFoodItem {
  name: string;
  amount: string;
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
}

export type MealSource = 'manual' | 'ai_generated' | 'ai_photo' | 'ai_text';

export interface NutritionMealEntry {
  id: string;
  date: string; // YYYY-MM-DD (KST) — see dateUtil.ts's todayDateKey, same convention trainingHistory uses
  mealType: MealType;
  foods: NutritionFoodItem[];
  source: MealSource;
  /** True for any AI-derived entry (generated/photo/text) — never true for 'manual'. Surfaced in the UI as "AI 추정값". */
  isEstimate: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
}

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
};

export const GOAL_TYPE_LABEL: Record<NutritionGoalType, string> = {
  lose: '감량',
  gain: '증량',
  maintain: '유지',
};
