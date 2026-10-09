import type { GymWeightCalcType } from '../../types';
import type { TrainingExerciseDetail, TrainingHistoryEntry } from '../trainingHistory/types';
import { listTrainingHistory } from '../trainingHistory/service';
import { canonicalTechniqueId } from '../techniqueCanonical';
import { shiftDateKeyDays, shiftDateKeyMonths, todayDateKey } from '../dateUtil';
import { computeGrowthRatePercent } from './growthRate';
import { computeExerciseVolumeKg } from './volume';

// 중량 변화율 + 볼륨 변화율 (지난 운동 / 지난주 / 지난달) — two SEPARATE
// metrics, never blended (90kg×8×3 beats 100kg×5×3 on volume while losing
// on weight). Read-only over the existing
// trainingHistory log, the same source records.ts/volume.ts read. Nothing
// here writes, back-fills or fabricates a past value: a comparison with no
// matching real record is simply absent.

/** One past session's per-set ACTUAL loads for one exercise. */
export interface PastWeightRecord {
  entryId: string;
  /** The day the workout was performed (TrainingHistoryEntry.date) — never a routine's scheduled weekday. */
  date: string;
  completedAt: string;
  /** Index = set index; null = that set wasn't performed / had no weight. */
  setLoadsKg: (number | null)[];
  /** Heaviest performed set — the same "최대 중량" representative getExerciseStats uses. */
  topLoadKg: number;
  /** Per-set load × reps, same indexing as setLoadsKg. */
  setVolumesKg: (number | null)[];
  /** Σ(load × reps) for this exercise in that session — volume.ts's computeExerciseVolumeKg, the app-wide volume definition. */
  totalVolumeKg: number;
}

export type WeightBaselineKind = 'lastSession' | 'lastWeek' | 'lastMonth';

export const WEIGHT_BASELINE_LABEL: Record<WeightBaselineKind, string> = {
  lastSession: '지난 운동',
  lastWeek: '지난주',
  lastMonth: '지난달',
};

export interface WeightBaselines {
  lastSession: PastWeightRecord | null;
  lastWeek: PastWeightRecord | null;
  lastMonth: PastWeightRecord | null;
}

/**
 * Comparisons only make sense between the same load semantics: a
 * weightCalcType change (e.g. standard → dumbbell) means the stored numbers
 * no longer measure the same thing, so those records are skipped instead
 * of being compared. Undefined is 'standard' (GymWeightCalcType's own
 * convention). Bodyweight exercises never get a weight comparison — the
 * stored "load" is just the lifter's bodyweight, not a lifted weight.
 */
function sameCalcType(a: GymWeightCalcType | null | undefined, b: GymWeightCalcType | null | undefined): boolean {
  return (a ?? 'standard') === (b ?? 'standard');
}

export function supportsWeightComparison(weightCalcType: GymWeightCalcType | null | undefined): boolean {
  return (weightCalcType ?? 'standard') !== 'bodyweight';
}

function toRecord(entry: TrainingHistoryEntry, ex: TrainingExerciseDetail): PastWeightRecord | null {
  // Actual load after weightCalcType (dumbbell ×2 etc.), falling back to the
  // raw value for entries recorded before that field existed — the exact
  // fallback getExerciseStats/volume.ts use.
  const weights = ex.actualCalculatedWeightKg ?? ex.actualWeightKg;
  if (!weights) return null;
  const setLoadsKg = weights.map((w, i) => (w != null && w > 0 && ex.actualReps[i] != null ? w : null));
  const performed = setLoadsKg.filter((w): w is number => w != null);
  // Reps-only / time-only / never-weighed sets: nothing to compare against.
  if (performed.length === 0) return null;
  const setVolumesKg = setLoadsKg.map((w, i) => (w != null ? w * (ex.actualReps[i] ?? 0) : null));
  return {
    entryId: entry.id,
    date: entry.date,
    completedAt: entry.completedAt,
    setLoadsKg,
    topLoadKg: Math.max(...performed),
    setVolumesKg,
    totalVolumeKg: computeExerciseVolumeKg(ex),
  };
}

/**
 * Every completed past session of this exercise that recorded a weight,
 * newest first. Identity is the canonical technique id (techniqueCanonical/),
 * never the display name — a renamed/merged/linked technique keeps its
 * history.
 */
export function listPastWeightRecords(
  techniqueId: string,
  weightCalcType: GymWeightCalcType | null | undefined,
  entries: TrainingHistoryEntry[] = listTrainingHistory()
): PastWeightRecord[] {
  const target = canonicalTechniqueId(techniqueId);
  const records: PastWeightRecord[] = [];
  for (const entry of entries) {
    if (!entry.completed || !entry.exerciseDetails) continue;
    for (const ex of entry.exerciseDetails) {
      if (canonicalTechniqueId(ex.techniqueId) !== target) continue;
      if (!sameCalcType(ex.weightCalcType, weightCalcType)) continue;
      const record = toRecord(entry, ex);
      if (record) records.push(record);
    }
  }
  // Cloud-pulled entries aren't guaranteed newest-first, so sort explicitly.
  return records.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
}

/** Newest record on or before `onOrBefore`, but no older than `notBefore` — an ancient record is never passed off as "지난주/지난달". */
function nearestPrior(records: PastWeightRecord[], onOrBefore: string, notBefore: string): PastWeightRecord | null {
  return records.find((r) => r.date <= onOrBefore && r.date >= notBefore) ?? null;
}

/**
 * - 지난 운동: the most recent recorded session of this exercise.
 * - 지난주: the closest record on or before 7 days ago (within the 7 days before that).
 * - 지난달: the closest record on or before the same date last month (within the month before that).
 * All by the PERFORMED date, so a session that ran another weekday's routine counts on the day it was done.
 */
export function findWeightBaselines(records: PastWeightRecord[], today: string = todayDateKey()): WeightBaselines {
  const weekTarget = shiftDateKeyDays(today, -7);
  const monthTarget = shiftDateKeyMonths(today, -1);
  return {
    lastSession: records[0] ?? null,
    lastWeek: nearestPrior(records, weekTarget, shiftDateKeyDays(weekTarget, -7)),
    lastMonth: nearestPrior(records, monthTarget, shiftDateKeyMonths(monthTarget, -1)),
  };
}

export interface WeightComparison {
  previousKg: number;
  /** 'set' = same set number last time; 'top' = that session's heaviest set (it had no set with this number). */
  basis: 'set' | 'top';
  /** Rounded to 1 decimal. */
  percent: number;
}

/** Current set's load vs a past record — same set index when that set was performed, otherwise the record's top set. */
export function compareLoad(currentKg: number | null, record: PastWeightRecord, setIndex: number): WeightComparison | null {
  const sameSet = record.setLoadsKg[setIndex];
  const previousKg = sameSet ?? record.topLoadKg;
  const basis = sameSet != null ? 'set' : 'top';
  if (currentKg == null || !Number.isFinite(currentKg) || currentKg <= 0) return null;
  return { previousKg, basis, percent: computeGrowthRatePercent(currentKg, previousKg) };
}

export interface VolumeComparison {
  previousKg: number;
  /** 'total' = that session's whole volume; 'sameSets' = only its first N sets, while today's exercise is still in progress at N sets. */
  basis: 'total' | 'sameSets';
  setCount: number;
  /** Rounded to 1 decimal. */
  percent: number;
}

/**
 * Today's volume so far (one entry per performed set, in order: load × reps)
 * vs a past session. While today's exercise has fewer sets done than that
 * session had, it is compared against that session's first N sets — a
 * 2-of-3-sets-done total vs a full 3-set total would always read as a drop.
 */
export function compareVolume(currentSetVolumesKg: number[], record: PastWeightRecord): VolumeComparison | null {
  const current = currentSetVolumesKg.reduce((a, b) => a + b, 0);
  if (currentSetVolumesKg.length === 0 || !Number.isFinite(current) || current <= 0) return null;
  const past = record.setVolumesKg.filter((v): v is number => v != null);
  const n = currentSetVolumesKg.length;
  const basis = n >= past.length ? 'total' : 'sameSets';
  const previousKg = basis === 'total' ? record.totalVolumeKg : past.slice(0, n).reduce((a, b) => a + b, 0);
  if (!(previousKg > 0)) return null;
  return { previousKg, basis, setCount: n, percent: computeGrowthRatePercent(current, previousKg) };
}

/** ▲ +5.3% / ▼ -5.3% / — 0% */
export function formatChangePercent(percent: number): string {
  if (percent > 0) return `▲ +${percent.toFixed(1)}%`;
  if (percent < 0) return `▼ ${percent.toFixed(1)}%`;
  return '— 0%';
}
