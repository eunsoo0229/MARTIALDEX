import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { computeEntryVolumeKg } from '../gymTraining/volume';

export interface CalendarDayData {
  dateKey: string; // YYYY-MM-DD
  count: number;
  totalMinutes: number;
  /** kg — gym set volume for this day, via computeEntryVolumeKg. 0 for every entry with no weight-tracked sets (all pre-gym-feature entries, and non-weight-training sessions). */
  totalVolume: number;
  /** 0 = no training that day; 1-3 = relative intensity within this month's own range (never compared across months). Still minutes-based, not volume-based — see TrainingCalendarView.tsx's showVolume prop for the separate volume display. */
  intensity: 0 | 1 | 2 | 3;
}

/** month is 0-indexed (JS Date convention) — computeCalendarMonth(entries, 2026, 7) is August 2026. */
export function computeCalendarMonth(entries: TrainingHistoryEntry[], year: number, month: number): CalendarDayData[] {
  const byDate = new Map<string, { count: number; totalMinutes: number; totalVolume: number }>();
  for (const e of entries) {
    if (!e.completed) continue;
    const cur = byDate.get(e.date) ?? { count: 0, totalMinutes: 0, totalVolume: 0 };
    cur.count += 1;
    cur.totalMinutes += e.actualMinutes ?? e.estimatedMinutes;
    cur.totalVolume += computeEntryVolumeKg(e);
    byDate.set(e.date, cur);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const maxMinutes = Math.max(1, ...[...byDate.values()].map((v) => v.totalMinutes));

  const result: CalendarDayData[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const data = byDate.get(dateKey);
    const totalMinutes = data?.totalMinutes ?? 0;
    let intensity: 0 | 1 | 2 | 3 = 0;
    if (totalMinutes > 0) {
      const ratio = totalMinutes / maxMinutes;
      intensity = ratio > 0.66 ? 3 : ratio > 0.33 ? 2 : 1;
    }
    result.push({ dateKey, count: data?.count ?? 0, totalMinutes, totalVolume: data?.totalVolume ?? 0, intensity });
  }
  return result;
}
