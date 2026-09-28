import { useEffect, useState } from 'react';
import type { NutritionProfile } from './types';
import { getNutritionProfileWithPrefill } from './profileService';

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    window.addEventListener('martialdex:nutrition-profile-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:nutrition-profile-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/** Reactive nutrition profile (goal + BMR inputs), prefilled from gymTraining bodyweight when unset. Same useSynced pattern as trainingHistory/useTrainingHistory.ts. */
export function useNutritionProfile(): NutritionProfile {
  return useSynced(getNutritionProfileWithPrefill);
}
