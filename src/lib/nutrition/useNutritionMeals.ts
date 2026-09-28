import { useEffect, useState } from 'react';
import type { NutritionMealEntry } from './types';
import { listAllMeals } from './mealService';

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    window.addEventListener('martialdex:nutrition-meals-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:nutrition-meals-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/** All meals, reactive to every add/update/delete + cross-tab/cloud-sync writes. Same useSynced pattern as trainingHistory/useTrainingHistory.ts. */
export function useNutritionMeals(): NutritionMealEntry[] {
  return useSynced(listAllMeals);
}
