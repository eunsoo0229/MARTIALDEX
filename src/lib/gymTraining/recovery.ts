import type { GymBodyPart } from '../../types';
import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { resolveTechniquesByIds } from '../userTechniques/service';
import { computeExerciseVolumeKg } from './volume';
import { secondaryBodyPartsFor } from './muscleMap';

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

interface EntryTechniqueHit {
  entry: TrainingHistoryEntry;
  techniqueId: string;
  setIndices: number[];
  /** 1.0 when this body part is the exercise's primary gymBodyPart, 0.5 when it's only a mapped secondary muscle (grounded mapping — see muscleMap.ts). */
  weight: number;
}

/**
 * Primary attribution uses the exercise's own structured gymBodyPart field
 * directly (e.g. 벤치프레스 -> chest) at full weight. Secondary attribution
 * uses the grounded 보조 근육 -> body-part mapping (muscleMap.ts) at half
 * weight — e.g. 스쿼트's primary is quads, but its 보조 근육 "둔근,
 * 햄스트링" also gives glutes/hamstrings partial recovery-fatigue credit,
 * matching real exercise physiology instead of ignoring secondary muscles
 * entirely.
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
      if (setIndices.length > 0) hits.push({ entry, techniqueId: ex.techniqueId, setIndices, weight: isPrimary ? 1 : 0.5 });
    }
  }
  return hits;
}

/**
 * Non-medical, internally-consistent estimate only. Model: hours since the
 * body part was last trained, compared against a "required recovery hours"
 * figure that scales with how much that last session's sets stressed it
 * (completed sets × average RPE, both guarded against empty/zero data).
 * Reference point: 10 completed sets at RPE 7 -> 1.0x multiplier (i.e.
 * exactly BASE_RECOVERY_HOURS needed); lighter/fewer-set sessions need less,
 * heavier sessions need more — the multiplier is clamped to [0.5x, 2x] so no
 * session can demand an absurd recovery window. requiredHours is always a
 * product of positive constants, so recoveryPercent is structurally
 * incapable of NaN/Infinity/negative/over-100.
 */
export function computeBodyPartRecovery(bodyPart: GymBodyPart, entries: TrainingHistoryEntry[], now: Date = new Date()): BodyPartRecovery {
  const hits = findHitsForBodyPart(bodyPart, entries);
  if (hits.length === 0) {
    return { bodyPart, recoveryPercent: 100, status: 'no_data', lastTrainedAt: null, hoursSinceLastTrained: null, recentVolumeKg: 0 };
  }

  // Most recent training DAY for this body part (by entry.date), then
  // aggregate every entry sharing that date so a same-day routine +
  // free-training combo both count (e.g. today's routine's bench press AND
  // today's free-training bench press both contribute — see volume.ts's
  // "sum across all matching entries" design, same principle here).
  const mostRecentDate = hits.reduce((max, h) => (h.entry.date > max ? h.entry.date : max), hits[0].entry.date);
  const sameDayHits = hits.filter((h) => h.entry.date === mostRecentDate);

  let effectiveSets = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  let recentVolumeKg = 0;
  let lastTrainedAt: string | null = null;

  for (const h of sameDayHits) {
    effectiveSets += h.setIndices.length * h.weight;
    const ex = h.entry.exerciseDetails!.find((e) => e.techniqueId === h.techniqueId)!;
    // recentVolumeKg is this specific exercise's volume only (not the whole
    // session) — a same-day session mixing e.g. bench press + squat must not
    // attribute the squat's volume to 가슴's "최근 볼륨".
    recentVolumeKg += computeExerciseVolumeKg(ex);
    if (ex.actualRpe) {
      for (const i of h.setIndices) {
        const rpe = ex.actualRpe[i];
        if (rpe != null) {
          rpeSum += rpe;
          rpeCount++;
        }
      }
    }
    if (!lastTrainedAt || h.entry.completedAt > lastTrainedAt) lastTrainedAt = h.entry.completedAt;
  }

  const hoursSince = Math.max(0, (now.getTime() - new Date(lastTrainedAt!).getTime()) / 3_600_000);
  const setsFactor = effectiveSets > 0 ? effectiveSets / 10 : 0.5;
  const avgRpe = rpeCount > 0 ? rpeSum / rpeCount : null;
  const rpeFactor = avgRpe != null && avgRpe > 0 ? avgRpe / 7 : 1;
  const intensityMultiplier = Math.min(2, Math.max(0.5, setsFactor * rpeFactor));
  const requiredHours = BASE_RECOVERY_HOURS * intensityMultiplier; // always > 0

  const recoveryPercent = Math.min(100, Math.max(0, Math.round((hoursSince / requiredHours) * 100)));
  return {
    bodyPart,
    recoveryPercent,
    status: recoveryPercent >= 100 ? 'recovered' : 'recovering',
    lastTrainedAt,
    hoursSinceLastTrained: hoursSince,
    recentVolumeKg,
  };
}

export function computeAllBodyPartRecovery(entries: TrainingHistoryEntry[], now: Date = new Date()): BodyPartRecovery[] {
  return GYM_BODY_PARTS.map((bp) => computeBodyPartRecovery(bp, entries, now));
}
