import type { TrainingExerciseDetail } from '../trainingHistory/types';
import { listTrainingHistory } from '../trainingHistory/service';

export interface ExerciseStats {
  lastPerformedAt: string | null;
  timesPerformed: number;
  totalSets: number;
  maxWeightKg: number;
  maxReps: number;
  maxSetVolumeKg: number;
  cumulativeVolumeKg: number;
}

/** Every recorded set-detail for one exercise, newest session first — same iteration pattern as trainingHistory/service.ts's getPracticeStatsForTechnique. */
export function getExerciseHistory(techniqueId: string): TrainingExerciseDetail[] {
  const result: TrainingExerciseDetail[] = [];
  // listTrainingHistory() returns newest-first (repository.add unshifts).
  for (const entry of listTrainingHistory()) {
    if (!entry.completed || !entry.exerciseDetails) continue;
    for (const ex of entry.exerciseDetails) {
      if (ex.techniqueId === techniqueId) result.push(ex);
    }
  }
  return result;
}

/** The most recent completed session's sets for one exercise, formatted for display (e.g. "60kg×10, 60kg×10, 60kg×8"). */
export function formatLastSessionSets(techniqueId: string): string | null {
  const history = getExerciseHistory(techniqueId);
  const last = history[0];
  if (!last || !last.actualWeightKg) return null;
  const parts: string[] = [];
  for (let i = 0; i < last.actualWeightKg.length; i++) {
    const w = last.actualWeightKg[i];
    const reps = last.actualReps[i];
    if (w == null || reps == null) continue;
    parts.push(`${Math.round(w)}kg×${reps}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

export function getExerciseStats(techniqueId: string): ExerciseStats {
  const history = getExerciseHistory(techniqueId);
  const stats: ExerciseStats = {
    lastPerformedAt: null,
    timesPerformed: history.length,
    totalSets: 0,
    maxWeightKg: 0,
    maxReps: 0,
    maxSetVolumeKg: 0,
    cumulativeVolumeKg: 0,
  };
  for (const ex of history) {
    if (!stats.lastPerformedAt && ex.finishedAt) stats.lastPerformedAt = ex.finishedAt;
    // Actual load after the technique's GymWeightCalcType (e.g. a dumbbell
    // set's real load is 2× the one-dumbbell value the user typed) — see
    // gymTraining/volume.ts's computeExerciseVolumeKg, the same field this
    // mirrors so 최대 중량/누적 볼륨 here always agree with 오늘/주간/월간 볼륨
    // elsewhere instead of quietly using a different formula.
    const weights = ex.actualCalculatedWeightKg ?? ex.actualWeightKg;
    if (!weights) continue;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      const reps = ex.actualReps[i];
      if (w == null || reps == null) continue;
      stats.totalSets++;
      stats.maxWeightKg = Math.max(stats.maxWeightKg, w);
      stats.maxReps = Math.max(stats.maxReps, reps);
      const setVolume = w * reps;
      stats.maxSetVolumeKg = Math.max(stats.maxSetVolumeKg, setVolume);
      stats.cumulativeVolumeKg += setVolume;
    }
  }
  return stats;
}
