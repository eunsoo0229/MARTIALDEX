import type { GymBodyPart } from '../../types';
import type { TrainingExerciseDetail, TrainingHistoryEntry } from '../trainingHistory/types';
import { resolveTechniquesByIds } from '../userTechniques/service';
import { computeExerciseVolumeKg } from './volume';
import { secondaryBodyPartsFor } from './muscleMap';
import { canonicalTechniqueId } from '../techniqueCanonical';

// Recovery/body-part tracking has no precedent anywhere in the codebase —
// this is genuinely new. Explicitly NOT a medical estimate (see the UI
// disclaimer in BodyPartMap.tsx) — just an internally-consistent, always-
// clamped reference number derived from training-record data.

/** The 12 body parts the recovery UI tracks — cardio/full_body are excluded (see gymTraining/library.ts header comment: their "주요 근육" values, "심폐계"/"등, 하체", aren't real single-muscle-group data). */
export const GYM_BODY_PARTS: GymBodyPart[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'lower_back',
];

export const GYM_BODY_PART_LABEL: Record<GymBodyPart, string> = {
  chest: '가슴',
  back: '등',
  shoulders: '어깨',
  biceps: '이두',
  triceps: '삼두',
  forearms: '전완',
  abs: '복근',
  glutes: '둔근',
  quads: '대퇴사두근',
  hamstrings: '햄스트링',
  calves: '종아리',
  lower_back: '허리',
  cardio: '유산소',
  full_body: '전신',
};

export interface BodyPartRecovery {
  bodyPart: GymBodyPart;
  /** 0-100, always clamped — never NaN/Infinity/negative/over-100. */
  recoveryPercent: number;
  status: 'no_data' | 'recovering' | 'recovered';
  lastTrainedAt: string | null;
  hoursSinceLastTrained: number | null;
  /** Total volume (kg) from the single most recent training day that hit this body part. */
  recentVolumeKg: number;
}

const BASE_RECOVERY_HOURS = 48;
/**
 * Effective sets that fully fatigue a body part (recovery 0% right after).
 * Same reference point the model always used: 10 hard sets at RPE 7 at the
 * lifter's usual working load = "a full session for this muscle".
 */
const FULL_FATIGUE_SETS = 10;
/** A mapped secondary (보조) muscle gets this share of each set's fatigue — the same 0.5 weighting this module already used. */
const SECONDARY_CONTRIBUTION = 0.5;

interface EntryTechniqueHit {
  entry: TrainingHistoryEntry;
  exercise: TrainingExerciseDetail;
  setIndices: number[];
  /** 1.0 when this body part is the exercise's primary gymBodyPart, SECONDARY_CONTRIBUTION when it's only a mapped secondary muscle (grounded mapping — see muscleMap.ts). */
  weight: number;
}

/**
 * Primary attribution uses the exercise's own structured gymBodyPart field
 * directly (e.g. 벤치프레스 -> chest) at full weight. Secondary attribution
 * uses the grounded 보조 근육 -> body-part mapping (muscleMap.ts) at
 * SECONDARY_CONTRIBUTION — e.g. 스쿼트's primary is quads, while its 보조
 * 근육 "둔근, 햄스트링" give glutes/hamstrings partial fatigue only.
 */
function findHitsForBodyPart(bodyPart: GymBodyPart, entries: TrainingHistoryEntry[]): EntryTechniqueHit[] {
  const hits: EntryTechniqueHit[] = [];
  for (const entry of entries) {
    if (!entry.completed || !entry.exerciseDetails) continue;
    for (const ex of entry.exerciseDetails) {
      const technique = resolveTechniquesByIds([ex.techniqueId])[0];
      if (!technique) continue;
      const isPrimary = technique.gymBodyPart === bodyPart;
      const isSecondary = !isPrimary && secondaryBodyPartsFor(technique.secondaryMuscles, technique.gymBodyPart).includes(bodyPart);
      if (!isPrimary && !isSecondary) continue;
      const setIndices: number[] = [];
      ex.actualReps.forEach((reps, i) => {
        if (reps != null) setIndices.push(i);
      });
      if (setIndices.length > 0) hits.push({ entry, exercise: ex, setIndices, weight: isPrimary ? 1 : SECONDARY_CONTRIBUTION });
    }
  }
  return hits;
}

function setLoadKg(ex: TrainingExerciseDetail, i: number): number | null {
  const w = (ex.actualCalculatedWeightKg ?? ex.actualWeightKg)?.[i];
  return w != null && Number.isFinite(w) && w > 0 ? w : null;
}

/** The user's own heaviest recorded set per exercise (canonical id) — the reference "heavy" load for that exercise. */
function bestLoadByExercise(entries: TrainingHistoryEntry[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.completed || !entry.exerciseDetails) continue;
    for (const ex of entry.exerciseDetails) {
      const id = canonicalTechniqueId(ex.techniqueId);
      ex.actualReps.forEach((reps, i) => {
        const w = reps != null ? setLoadKg(ex, i) : null;
        if (w != null && w > (best.get(id) ?? 0)) best.set(id, w);
      });
    }
  }
  return best;
}

/**
 * Effective sets one exercise put on this body part. Each performed set
 * counts 1, scaled by
 *   - RPE (rpe/7, clamped 0.5-1.5; unrecorded = 1, the reference RPE 7),
 *   - load vs the user's own best for that exercise (0.6 + 0.4 × ratio, so a
 *     light set counts 0.6-1; no weight data = 1, i.e. no discount invented),
 *   - primary (1.0) vs secondary (SECONDARY_CONTRIBUTION) involvement.
 */
function effectiveSetsOf(hit: EntryTechniqueHit, bestLoads: Map<string, number>): number {
  const ex = hit.exercise;
  const best = bestLoads.get(canonicalTechniqueId(ex.techniqueId)) ?? 0;
  let total = 0;
  for (const i of hit.setIndices) {
    const rpe = ex.actualRpe?.[i];
    const rpeFactor = rpe != null && rpe > 0 ? Math.min(1.5, Math.max(0.5, rpe / 7)) : 1;
    const load = setLoadKg(ex, i);
    const loadFactor = load != null && best > 0 ? 0.6 + 0.4 * Math.min(1, load / best) : 1;
    total += rpeFactor * loadFactor;
  }
  return total * hit.weight;
}

/**
 * Non-medical, internally-consistent estimate only. recoveryPercent keeps
 * its meaning — 100 = fully recovered, 0 = fully fatigued — but is now
 * 100 − (remaining fatigue), not "hours since ÷ hours needed":
 *   - each exercise adds fatigue = its effective sets / FULL_FATIGUE_SETS
 *     (so 1 set of bench leaves 가슴 at ~90%, and a secondary 삼두 even
 *     less affected) instead of every touched muscle reading 0% right after
 *     any single set — the old model's bug, since its required-hours floor
 *     (24h) guaranteed 0% at hoursSince = 0 regardless of set count or
 *     primary/secondary role;
 *   - that fatigue decays linearly over its own recovery window
 *     (BASE_RECOVERY_HOURS × effective sets/10, clamped 0.5x-2x — the same
 *     scaling the old model used);
 *   - several exercises/sessions hitting the same muscle (e.g. 삼두 as a
 *     secondary in both bench press and overhead press) add up, clamped.
 * Built only from positive finite terms and clamped, so never NaN/negative/over-100.
 */
export function computeBodyPartRecovery(
  bodyPart: GymBodyPart,
  entries: TrainingHistoryEntry[],
  now: Date = new Date(),
  bestLoads: Map<string, number> = bestLoadByExercise(entries)
): BodyPartRecovery {
  const hits = findHitsForBodyPart(bodyPart, entries);
  if (hits.length === 0) {
    return { bodyPart, recoveryPercent: 100, status: 'no_data', lastTrainedAt: null, hoursSinceLastTrained: null, recentVolumeKg: 0 };
  }

  let remainingFatigue = 0;
  for (const h of hits) {
    const effectiveSets = effectiveSetsOf(h, bestLoads);
    const fatigue = Math.min(100, (effectiveSets / FULL_FATIGUE_SETS) * 100);
    const requiredHours = BASE_RECOVERY_HOURS * Math.min(2, Math.max(0.5, effectiveSets / FULL_FATIGUE_SETS)); // always > 0
    const hoursSince = Math.max(0, (now.getTime() - new Date(h.entry.completedAt).getTime()) / 3_600_000);
    remainingFatigue += fatigue * Math.max(0, 1 - hoursSince / requiredHours);
  }

  // "최근" display fields: the most recent training DAY for this body part
  // (by entry.date), aggregated across every entry that day.
  const mostRecentDate = hits.reduce((max, h) => (h.entry.date > max ? h.entry.date : max), hits[0].entry.date);
  let recentVolumeKg = 0;
  let lastTrainedAt: string | null = null;
  for (const h of hits) {
    if (h.entry.date !== mostRecentDate) continue;
    // This exercise's volume only — a same-day bench + squat session must
    // not attribute the squat's volume to 가슴's "최근 볼륨".
    recentVolumeKg += computeExerciseVolumeKg(h.exercise);
    if (!lastTrainedAt || h.entry.completedAt > lastTrainedAt) lastTrainedAt = h.entry.completedAt;
  }

  const recoveryPercent = Math.min(100, Math.max(0, Math.round(100 - Math.min(100, remainingFatigue))));
  return {
    bodyPart,
    recoveryPercent,
    status: recoveryPercent >= 100 ? 'recovered' : 'recovering',
    lastTrainedAt,
    hoursSinceLastTrained: Math.max(0, (now.getTime() - new Date(lastTrainedAt!).getTime()) / 3_600_000),
    recentVolumeKg,
  };
}

export function computeAllBodyPartRecovery(entries: TrainingHistoryEntry[], now: Date = new Date()): BodyPartRecovery[] {
  const bestLoads = bestLoadByExercise(entries);
  return GYM_BODY_PARTS.map((bp) => computeBodyPartRecovery(bp, entries, now, bestLoads));
}
