import type { PeriodKey } from './types';
import { PERIOD_DAYS } from './types';

/** Inclusive start-of-day boundary for the period, or null for 'all' (no lower bound). */
export function getPeriodStart(period: PeriodKey, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  const days = PERIOD_DAYS[period];
  return new Date(now.getTime() - days * 86400000);
}

export function isWithinPeriod(isoDateOrTimestamp: string, period: PeriodKey, now: Date = new Date()): boolean {
  const start = getPeriodStart(period, now);
  if (!start) return true;
  const t = new Date(isoDateOrTimestamp).getTime();
  return t >= start.getTime() && t <= now.getTime();
}

/**
 * The immediately-preceding period of the SAME length, used for real
 * period-over-period comparisons (AI summary "증가/감소" claims) — e.g. for
 * '30d', this is the 30 days before that. Returns null for 'all' since there
 * is no meaningful "previous all-time" window.
 */
export function getPreviousPeriodRange(period: PeriodKey, now: Date = new Date()): { start: Date; end: Date } | null {
  if (period === 'all') return null;
  const days = PERIOD_DAYS[period];
  const end = new Date(now.getTime() - days * 86400000);
  const start = new Date(end.getTime() - days * 86400000);
  return { start, end };
}

export function isWithinRange(isoDateOrTimestamp: string, range: { start: Date; end: Date }): boolean {
  const t = new Date(isoDateOrTimestamp).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}
