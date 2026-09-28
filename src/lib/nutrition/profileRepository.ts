import { createDefaultNutritionProfile, type NutritionProfile } from './types';

// Singleton (one profile per user, like `profiles` itself) rather than a
// list — no delete-tombstone is needed since a profile is only ever
// replaced, never deleted (matches profileRepository-style singletons
// elsewhere, e.g. auth's Profile row).
const KEY = 'martialdex:nutrition-profile';
const EVENT = 'martialdex:nutrition-profile-updated';

export const nutritionProfileRepository = {
  get(): NutritionProfile {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return createDefaultNutritionProfile();
      return { ...createDefaultNutritionProfile(), ...(JSON.parse(raw) as Partial<NutritionProfile>) };
    } catch {
      return createDefaultNutritionProfile();
    }
  },
  save(profile: NutritionProfile): void {
    const updated: NutritionProfile = { ...profile, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EVENT));
  },
  /** Cloud pull — only overwrites local if the cloud copy is newer (or local was never customized). */
  mergeFromCloud(cloudProfile: NutritionProfile): boolean {
    const local = this.get();
    if (cloudProfile.updatedAt > local.updatedAt) {
      window.localStorage.setItem(KEY, JSON.stringify(cloudProfile));
      window.dispatchEvent(new CustomEvent(EVENT));
      return true;
    }
    return false;
  },
};

export { EVENT as NUTRITION_PROFILE_EVENT };
