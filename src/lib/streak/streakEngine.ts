import { listTrainingHistory } from '../trainingHistory/service';
import { dateKeyOf, todayDateKey } from '../dateUtil';
import type { TrainingHistoryEntry } from '../trainingHistory/types';

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastTrainedDate: string | null;
}

function addDaysKey(dateKey: string, delta: number): string {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Only calendar days with a real completed trainingHistory entry count —
// opening the app, browsing a technique, or starting-but-abandoning a
// session never extends the streak (spec: "앱을 켠 것만으로 훈련한 것으로
// 처리하지 않는다").
export function computeStreak(entries: TrainingHistoryEntry[] = listTrainingHistory()): StreakInfo {
  const dateSet = new Set(entries.filter((e) => e.completed).map((e) => dateKeyOf(e.date)));
  if (dateSet.size === 0) return { currentStreak: 0, longestStreak: 0, lastTrainedDate: null };

  const sortedDates = [...dateSet].sort();
  const lastTrainedDate = sortedDates[sortedDates.length - 1];

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    run = sortedDates[i] === addDaysKey(sortedDates[i - 1], 1) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const today = todayDateKey();
  let cursor = dateSet.has(today) ? today : addDaysKey(today, -1);
  let current = 0;
  while (dateSet.has(cursor)) {
    current++;
    cursor = addDaysKey(cursor, -1);
  }

  return { currentStreak: current, longestStreak: longest, lastTrainedDate };
}
