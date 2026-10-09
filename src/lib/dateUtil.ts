// Shared by AI 개인 코치 / 나의 기술 / 기술 상세 — one place for "N일 전" style
// relative labels so the phrasing stays consistent across the new 12~14단계
// screens.
//
// todayDateKey() is KST-based (see KST_OFFSET_MS below) — previously used
// new Date().toISOString() (UTC), which misattributed entries recorded
// between KST midnight and 09:00 KST to the PREVIOUS day (UTC is still
// showing "yesterday" during that 9-hour window). Fixed as part of the gym
// tracking feature's KST-correctness requirement, but this fix applies to
// the whole training system (every TrainingHistoryEntry.date / TodaySessionState.date),
// not just gym entries — every caller gets a more accurate day boundary
// going forward; the return shape (YYYY-MM-DD string) is unchanged.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayDateKey(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function dateKeyOf(iso: string): string {
  return iso.slice(0, 10);
}

export function formatRelativeDays(iso: string | null): string {
  if (!iso) return '기록 없음';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

/** ISO weekday, 월=1..일=7 — avoids JS Date.getDay()'s 일=0 ambiguity for day-of-week routine matching. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAY_LABEL: Record<Weekday, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' };

function toKstParts(d: Date): { y: number; m: number; day: number; isoWeekday: Weekday } {
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const jsWeekday = kst.getUTCDay(); // 0=Sun..6=Sat, computed on the KST-shifted instant
  return {
    y: kst.getUTCFullYear(),
    m: kst.getUTCMonth(),
    day: kst.getUTCDate(),
    isoWeekday: (jsWeekday === 0 ? 7 : jsWeekday) as Weekday,
  };
}

function kstDateKeyOf(y: number, m: number, day: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Shifts a KST y/m/day by `deltaDays` (may be negative) and returns the resulting date key. */
function shiftKstDateKey(y: number, m: number, day: number, deltaDays: number): string {
  // Constructing via UTC epoch millis handles month/year rollover correctly
  // without a calendar library — this is arithmetic on a UTC instant, not a
  // real KST Date object, so it's safe even though the local machine may be
  // in a different timezone.
  const base = Date.UTC(y, m, day);
  const shifted = new Date(base + deltaDays * 86400000);
  return kstDateKeyOf(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

export function getKstWeekday(now: Date = new Date()): Weekday {
  return toKstParts(now).isoWeekday;
}

/** Mon-Sun calendar week containing `now`, as inclusive [start,end] YYYY-MM-DD KST date keys. */
export function getKstWeekRange(now: Date = new Date()): { start: string; end: string } {
  const { y, m, day, isoWeekday } = toKstParts(now);
  return {
    start: shiftKstDateKey(y, m, day, -(isoWeekday - 1)),
    end: shiftKstDateKey(y, m, day, 7 - isoWeekday),
  };
}

export function getPreviousKstWeekRange(now: Date = new Date()): { start: string; end: string } {
  const { start, end } = getKstWeekRange(now);
  return {
    start: shiftKstDateKey(...splitDateKey(start), -7),
    end: shiftKstDateKey(...splitDateKey(end), -7),
  };
}

/** [1st, last day] of the KST calendar month containing `now`, as YYYY-MM-DD date keys. */
export function getKstMonthRange(now: Date = new Date()): { start: string; end: string } {
  const { y, m } = toKstParts(now);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { start: kstDateKeyOf(y, m, 1), end: kstDateKeyOf(y, m, lastDay) };
}

export function getPreviousKstMonthRange(now: Date = new Date()): { start: string; end: string } {
  const { y, m } = toKstParts(now);
  // Date.UTC normalizes an out-of-range month (m-1 === -1) into December of
  // the previous year automatically, so this handles the January->December
  // year rollover without any special-casing.
  const marker = new Date(Date.UTC(y, m - 1, 1));
  const py = marker.getUTCFullYear();
  const pm = marker.getUTCMonth();
  const lastDay = new Date(Date.UTC(py, pm + 1, 0)).getUTCDate();
  return { start: kstDateKeyOf(py, pm, 1), end: kstDateKeyOf(py, pm, lastDay) };
}

function splitDateKey(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split('-').map(Number);
  return [y, m - 1, d];
}

/** YYYY-MM-DD date key shifted by `deltaDays` (may be negative) — pure calendar arithmetic, timezone-independent. */
export function shiftDateKeyDays(dateKey: string, deltaDays: number): string {
  return shiftKstDateKey(...splitDateKey(dateKey), deltaDays);
}

/** Same day-of-month `deltaMonths` away, clamped to that month's last day (e.g. 03-31 − 1 month → 02-28/29). */
export function shiftDateKeyMonths(dateKey: string, deltaMonths: number): string {
  const [y, m, d] = splitDateKey(dateKey);
  const marker = new Date(Date.UTC(y, m + deltaMonths, 1));
  const ty = marker.getUTCFullYear();
  const tm = marker.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return kstDateKeyOf(ty, tm, Math.min(d, lastDay));
}

/** KST calendar date (YYYY-MM-DD) of an ISO instant — unlike dateKeyOf(), which slices the UTC date. */
export function kstDateKeyOfInstant(iso: string): string {
  const { y, m, day } = toKstParts(new Date(iso));
  return kstDateKeyOf(y, m, day);
}
