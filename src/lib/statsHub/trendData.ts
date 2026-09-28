import type { PeriodKey, TrendPoint } from './types';
import { PERIOD_DAYS } from './types';
import { listTrainingHistory } from '../trainingHistory/service';
import { getAllRecords } from '../poseAnalysis/recordsService';

interface Bucket {
  label: string;
  start: Date;
  end: Date;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dailyBuckets(days: number, now: Date): Bucket[] {
  return Array.from({ length: days }, (_, i) => {
    const start = startOfDay(new Date(now.getTime() - (days - 1 - i) * 86400000));
    const end = new Date(start.getTime() + 86400000 - 1);
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, start, end };
  });
}

function weeklyBuckets(weeks: number, now: Date): Bucket[] {
  return Array.from({ length: weeks }, (_, i) => {
    const end = startOfDay(new Date(now.getTime() - (weeks - 1 - i) * 7 * 86400000 + 86400000 - 1));
    const start = new Date(end.getTime() - 6 * 86400000);
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, start, end };
  });
}

function monthlyBuckets(earliest: Date, now: Date): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor <= last) {
    const start = new Date(cursor);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    buckets.push({ label: `${cursor.getFullYear()}.${cursor.getMonth() + 1}`, start, end });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return buckets;
}

// 'all' has no fixed window — bucketed monthly starting from the EARLIEST
// real record, never an arbitrary/invented start date.
function buildBuckets(period: PeriodKey, earliestMs: number | null, now: Date): Bucket[] {
  if (period !== 'all') return period === '90d' ? weeklyBuckets(13, now) : dailyBuckets(PERIOD_DAYS[period], now);
  if (earliestMs === null) return [];
  return monthlyBuckets(new Date(earliestMs), now);
}

export function computeTrainingTimeTrend(period: PeriodKey, now: Date = new Date()): TrendPoint[] {
  const history = listTrainingHistory().filter((h) => h.completed);
  if (history.length === 0) return [];
  const earliest = Math.min(...history.map((h) => new Date(h.completedAt).getTime()));
  const buckets = buildBuckets(period, earliest, now);
  return buckets.map((b) => ({
    date: b.label,
    value: history.filter((h) => {
      const t = new Date(h.completedAt).getTime();
      return t >= b.start.getTime() && t <= b.end.getTime();
    }).reduce((sum, h) => sum + (h.actualMinutes ?? h.estimatedMinutes), 0),
  }));
}

export function computeTrainingCountTrend(period: PeriodKey, now: Date = new Date()): TrendPoint[] {
  const history = listTrainingHistory().filter((h) => h.completed);
  if (history.length === 0) return [];
  const earliest = Math.min(...history.map((h) => new Date(h.completedAt).getTime()));
  const buckets = buildBuckets(period, earliest, now);
  return buckets.map((b) => ({
    date: b.label,
    value: history.filter((h) => {
      const t = new Date(h.completedAt).getTime();
      return t >= b.start.getTime() && t <= b.end.getTime();
    }).length,
  }));
}

// Unlike the two trends above, an empty bucket here has no real average to
// report — it's dropped rather than shown as a fabricated 0 (0 would imply
// "scored zero," which never happened; it just means no analysis that day).
export function computeAverageScoreTrend(period: PeriodKey, now: Date = new Date()): TrendPoint[] {
  const records = getAllRecords();
  if (records.length === 0) return [];
  const earliest = Math.min(...records.map((r) => new Date(r.analyzedAt).getTime()));
  const buckets = buildBuckets(period, earliest, now);
  return buckets
    .map((b) => {
      const inBucket = records.filter((r) => {
        const t = new Date(r.analyzedAt).getTime();
        return t >= b.start.getTime() && t <= b.end.getTime();
      });
      return { date: b.label, value: inBucket.length ? Math.round(inBucket.reduce((sum, r) => sum + r.score, 0) / inBucket.length) : NaN };
    })
    .filter((p) => !Number.isNaN(p.value));
}
