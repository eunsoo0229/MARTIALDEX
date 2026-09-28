import type { HomeExerciseEquipment, Technique } from '../../types';

/**
 * Hard filter, not a scoring penalty (spec: "장비가 없는 경우 장비가 필요한
 * 운동을 임의로 넣지 않는다") — an exercise whose `equipment` includes
 * anything beyond what the user has available is excluded from matching
 * entirely, never merely deprioritized.
 */
export function exerciseFitsEquipment(exercise: Technique, available: HomeExerciseEquipment[]): boolean {
  const required = exercise.equipment ?? ['none'];
  if (required.length === 0 || (required.length === 1 && required[0] === 'none')) return true;
  const availableSet = new Set(available.length > 0 ? available : ['none']);
  return required.every((eq) => eq === 'none' || availableSet.has(eq));
}
