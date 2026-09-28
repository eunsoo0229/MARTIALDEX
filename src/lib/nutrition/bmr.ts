import type { NutritionProfile } from './types';

/**
 * Mifflin-St Jeor — the most widely-validated BMR formula for a general
 * population, chosen over Harris-Benedict (its older, less accurate
 * predecessor) precisely because this module must never present a number
 * with more confidence than it deserves. Returns null (never a fabricated
 * guess) unless weight/height/age/gender are ALL present — see
 * NutritionProfile's own doc comment on why none of these are ever defaulted.
 */
export function computeBmr(profile: NutritionProfile): number | null {
  const { bodyWeightKg, heightCm, age, gender } = profile;
  if (bodyWeightKg == null || heightCm == null || age == null || gender == null) return null;
  if (bodyWeightKg <= 0 || heightCm <= 0 || age <= 0) return null;
  const base = 10 * bodyWeightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === 'male' ? base + 5 : base - 161);
}

/**
 * "오늘 예상 소비 칼로리 = 기초대사량 + 오늘 훈련 예상 소비량" (item 10) — a
 * plain sum, deliberately not scaled by any additional "activity level"
 * multiplier the app has no real data to justify (no step count, no
 * wearable integration exists anywhere in this codebase). If BMR is
 * unknown, returns just the training component (never fabricates a BMR).
 */
export function computeEstimatedDailyBurn(bmr: number | null, trainingCaloriesKcal: number): { bmr: number | null; training: number; total: number } {
  return { bmr, training: Math.round(trainingCaloriesKcal), total: Math.round((bmr ?? 0) + trainingCaloriesKcal) };
}
