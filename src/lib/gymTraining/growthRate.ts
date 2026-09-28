import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { getPreviousKstMonthRange, getPreviousKstWeekRange } from '../dateUtil';
import { sumVolumeKg, volumeForKstMonth, volumeForKstWeek } from './volume';

export interface GrowthRate {
  currentValue: number;
  previousValue: number;
  /** Always a finite number — never NaN/Infinity. */
  percent: number;
}

/**
 * (current-previous)/previous*100, rounded to 1 decimal. previous<=0 (no
 * comparison data, or literally zero) returns 0% rather than dividing by
 * zero or fabricating an "infinite growth" figure — the result is always a
 * finite, displayable number by construction.
 */
export function computeGrowthRatePercent(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return 0;
  const pct = ((current - previous) / previous) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 10) / 10 : 0;
}

function filterByDateRange(entries: TrainingHistoryEntry[], range: { start: string; end: string }): TrainingHistoryEntry[] {
  return entries.filter((e) => e.date >= range.start && e.date <= range.end);
}

export function computeMonthlyVolumeGrowth(entries: TrainingHistoryEntry[], now: Date = new Date()): GrowthRate {
  const current = volumeForKstMonth(entries, now);
  const previous = sumVolumeKg(filterByDateRange(entries, getPreviousKstMonthRange(now)));
  return { currentValue: current, previousValue: previous, percent: computeGrowthRatePercent(current, previous) };
}

export function computeWeeklyVolumeGrowth(entries: TrainingHistoryEntry[], now: Date = new Date()): GrowthRate {
  const current = volumeForKstWeek(entries, now);
  const previous = sumVolumeKg(filterByDateRange(entries, getPreviousKstWeekRange(now)));
  return { currentValue: current, previousValue: previous, percent: computeGrowthRatePercent(current, previous) };
}
