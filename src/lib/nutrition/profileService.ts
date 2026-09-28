import type { NutritionProfile } from './types';
import { nutritionProfileRepository } from './profileRepository';
import { getUserBodyweightKg } from '../gymTraining/weightCalc';

export function getNutritionProfile(): NutritionProfile {
  return nutritionProfileRepository.get();
}

export function saveNutritionProfile(profile: NutritionProfile): NutritionProfile {
  nutritionProfileRepository.save(profile);
  return profile;
}

/**
 * Prefills the body-weight field from gymTraining/weightCalc.ts's
 * `getUserBodyweightKg()` (item 2's "기존 사용자 프로필 데이터와 연동해서 목표
 * 설정을 보조") — a one-time convenience default only, never overwriting a
 * value the user already entered here. The two settings stay independent
 * after this: editing one never silently changes the other.
 */
export function getNutritionProfileWithPrefill(): NutritionProfile {
  const profile = getNutritionProfile();
  if (profile.bodyWeightKg != null) return profile;
  const gymBodyweight = getUserBodyweightKg();
  return gymBodyweight != null ? { ...profile, bodyWeightKg: gymBodyweight } : profile;
}
