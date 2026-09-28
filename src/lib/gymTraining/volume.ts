import type { TrainingExerciseDetail, TrainingHistoryEntry } from '../trainingHistory/types';
import { getKstMonthRange, getKstWeekRange } from '../dateUtil';

export const KG_PER_LB = 0.45359237;

export function toKg(weight: number, unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? weight * KG_PER_LB : weight;
}

export function toDisplayUnit(weightKg: number, unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? weightKg / KG_PER_LB : weightKg;
}

/**
 * The single central volume calculation every consumer (오늘/주간/월간/달력
 * 볼륨, 성장률, 회복도, 운동별 누적 볼륨) goes through — actualLoad×reps for one
 * exercise's completed sets only. Reads actualCalculatedWeightKg (the ACTUAL
 * load after applying the technique's GymWeightCalcType — e.g. a dumbbell
 * set's real load is 2× what the user typed — see gymTraining/weightCalc.ts),
 * falling back to actualWeightKg for entries recorded before that field
 * existed, which is exactly correct: those were all 'standard'-calc
 * exercises where the raw input already WAS the actual load. A "completed"
 * set is one where both weight and actualReps[i] are non-null (parallel-
 * array convention, see trainingHistory/types.ts). Missing weight (e.g.
 * bodyweight-without-a-configured-calc-type/cardio exercises) contributes 0,
 * never NaN.
 */
export function computeExerciseVolumeKg(ex: TrainingExerciseDetail): number {
  const weights = ex.actualCalculatedWeightKg ?? ex.actualWeightKg;
  if (!weights) return 0;
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    const reps = ex.actualReps[i];
    if (w == null || reps == null) continue;
    total += w * reps;
  }
  return total;
}

/** Sums computeExerciseVolumeKg across every exercise in one completed entry. */
export function computeEntryVolumeKg(entry: TrainingHistoryEntry): number {
  if (!entry.completed || !entry.exerciseDetails) return 0;
  let total = 0;
  for (const ex of entry.exerciseDetails) total += computeExerciseVolumeKg(ex);
  return total;
}

export function sumVolumeKg(entries: TrainingHistoryEntry[]): number {
  let total = 0;
  for (const e of entries) total += computeEntryVolumeKg(e);
  return total;
}

/** Sums volume per techniqueId across the given entries. */
export function volumeByExercise(entries: TrainingHistoryEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.completed || !entry.exerciseDetails) continue;
    for (const ex of entry.exerciseDetails) {
      const exVolume = computeExerciseVolumeKg(ex);
      if (exVolume > 0) result[ex.techniqueId] = (result[ex.techniqueId] ?? 0) + exVolume;
    }
  }
  return result;
}

/** Sums volume per entry.date (YYYY-MM-DD) across the given entries — used by the volume calendar. */
export function volumeByDateKey(entries: TrainingHistoryEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const v = computeEntryVolumeKg(entry);
    if (v > 0) result[entry.date] = (result[entry.date] ?? 0) + v;
  }
  return result;
}

function filterByDateRange(entries: TrainingHistoryEntry[], range: { start: string; end: string }): TrainingHistoryEntry[] {
  return entries.filter((e) => e.date >= range.start && e.date <= range.end);
}

/** Total volume for the KST calendar week (Mon-Sun) containing `now`. */
export function volumeForKstWeek(entries: TrainingHistoryEntry[], now: Date = new Date()): number {
  return sumVolumeKg(filterByDateRange(entries, getKstWeekRange(now)));
}

/** Total volume for the KST calendar month containing `now`. */
export function volumeForKstMonth(entries: TrainingHistoryEntry[], now: Date = new Date()): number {
  return sumVolumeKg(filterByDateRange(entries, getKstMonthRange(now)));
}

export function formatVolumeCompact(kg: number): string {
  if (kg <= 0) return '0kg';
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}
