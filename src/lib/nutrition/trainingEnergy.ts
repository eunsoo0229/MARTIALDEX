import type { TrainingHistoryEntry } from '../trainingHistory/types';
import type { GymExerciseKind } from '../../types';
import { resolveTechniquesByIds } from '../userTechniques/service';
import { GYM_MARTIAL_ART_ID } from '../gymTraining/library';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../homeTraining/library';

/**
 * "MARTIALDEX 훈련과 칼로리 소비 연동" (item 9) — energy expenditure for a
 * completed training session. This is a MET (Metabolic Equivalent of Task)
 * model: kcal = MET × bodyWeightKg × hours. It is explicitly an ESTIMATE —
 * every caller must present it with "예상"/"추정" wording (see this file's
 * exports' own naming and the UI call sites) — never as a measured value.
 *
 * Why MET instead of using the gym module's real weight×reps volume data:
 * a checklist-recorded combat session (boxing/BJJ/wrestling/...) has NO
 * intensity signal at all beyond technique ids + duration (see
 * trainingHistory/types.ts — TrainingExerciseDetail, which would carry
 * RPE/weight, is optional and typically absent for those sources). Mixing
 * "real mechanical work for gym, guessed MET for everything else" would
 * make estimates inconsistent in a way that looks more precise than it is.
 * A single MET-based model, varied by activity type (and by
 * GymExerciseKind for gym specifically, which the data already provides
 * with real per-technique granularity), keeps every number honestly
 * approximate at the same level of precision.
 *
 * MET values below are commonly-cited approximate figures for these
 * activity categories (comparable to published compendia of physical
 * activity) — NOT measured for this specific user, hence always presented
 * as "예상". Reused/refined later only if the app ever gains a real
 * intensity signal (heart rate, wearable data) for combat sessions.
 */
const COMBAT_MET: Record<string, number> = {
  boxing: 9.0,
  kickboxing: 10.0,
  'muay-thai': 10.3,
  taekwondo: 10.3,
  karate: 10.3,
  judo: 10.3,
  wrestling: 8.0,
  bjj: 10.3,
  sambo: 8.0,
  'mixed-martial-arts': 10.0,
};

const GYM_KIND_MET: Record<GymExerciseKind, number> = {
  유산소: 8.0,
  복합: 6.0,
  단일: 4.0,
  등척성: 3.0,
};

const HOME_TRAINING_MET = 6.0;
/** Used when a session's techniqueIds don't resolve to any known technique (e.g. all user-added/unresolvable), or for any martial art not in the table above. */
const DEFAULT_MET = 6.0;

function metForMartialArt(martialArt: string, gymExerciseKind: GymExerciseKind | undefined): number {
  if (martialArt === GYM_MARTIAL_ART_ID) return GYM_KIND_MET[gymExerciseKind ?? '복합'] ?? DEFAULT_MET;
  if (martialArt === HOME_TRAINING_MARTIAL_ART_ID) return HOME_TRAINING_MET;
  return COMBAT_MET[martialArt] ?? DEFAULT_MET;
}

/**
 * Estimated kcal for one completed trainingHistory entry, or null when it
 * can't be estimated at all (no body weight known, or no usable duration —
 * never fabricates a number in either case). Duration source is
 * `actualMinutes ?? estimatedMinutes`, the same fallback idiom already used
 * throughout the app (trainingAnalytics/report.ts, calendarData.ts,
 * TrainingEntryRow.tsx). The session's total duration is split evenly
 * across its resolved techniques (mirrors statsHub/martialArtStats.ts's
 * "credit every distinct art touched this session" approach) — a session
 * combining e.g. a gym exercise and a boxing drill gets each technique's
 * own MET applied to its even share of the time, rather than picking just
 * one dominant activity.
 */
export function estimateSessionCalories(entry: TrainingHistoryEntry, bodyWeightKg: number | null): number | null {
  if (bodyWeightKg == null || bodyWeightKg <= 0) return null;
  const totalMinutes = entry.actualMinutes ?? entry.estimatedMinutes;
  if (!totalMinutes || totalMinutes <= 0) return null;

  const techniques = resolveTechniquesByIds(entry.techniqueIds);
  if (techniques.length === 0) {
    return Math.round(DEFAULT_MET * bodyWeightKg * (totalMinutes / 60));
  }

  const perTechniqueMinutes = totalMinutes / techniques.length;
  let totalKcal = 0;
  for (const t of techniques) {
    const met = metForMartialArt(t.martialArt, t.gymExerciseKind);
    totalKcal += met * bodyWeightKg * (perTechniqueMinutes / 60);
  }
  return Math.round(totalKcal);
}

/** Sums estimateSessionCalories across multiple entries (e.g. every session completed today) — used for "오늘 훈련 예상 소비량". Skips any entry that can't be estimated rather than treating it as 0 (a 0 would misleadingly suggest "no burn" instead of "unknown"), UNLESS every entry is unestimable, in which case 0 is the honest total. */
export function sumEstimatedCalories(entries: TrainingHistoryEntry[], bodyWeightKg: number | null): number {
  return entries.reduce((sum, e) => sum + (estimateSessionCalories(e, bodyWeightKg) ?? 0), 0);
}
