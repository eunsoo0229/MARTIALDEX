import { useEffect, useState } from 'react';
import { collectProfileStats, type ProfileStatsInput } from './collectProfileStats';
import { computeLevelInfo, type LevelInfo } from '../level/levelEngine';
import { computeRankInfo, type RankInfo } from '../rank/rankEngine';
import { computeAchievementStatuses, type AchievementStatus } from '../achievements/achievementEngine';

const EVENTS = [
  'martialdex:pose-records-updated',
  'martialdex:training-history-updated',
  'martialdex:sparring-sessions-updated',
  'martialdex:skill-overrides-updated',
  'martialdex:progress-updated',
  'martialdex:curricula-updated',
  'martialdex:achievements-updated',
  'martialdex:combos-updated',
  'martialdex:tactics-updated',
  'storage',
];

interface Combined {
  stats: ProfileStatsInput;
  achievements: AchievementStatus[];
}

// collectProfileStats() (which internally runs the one full
// computeAllSkillProgress() pass over all 1,253 techniques) is computed
// exactly ONCE per update and shared by both stats and achievements here —
// not recomputed separately for each.
function readCombined(): Combined {
  const stats = collectProfileStats();
  return { stats, achievements: computeAchievementStatuses(stats) };
}

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    for (const e of EVENTS) window.addEventListener(e, onUpdate);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useProfileStats(): { stats: ProfileStatsInput; level: LevelInfo; rank: RankInfo; achievements: AchievementStatus[] } {
  const { stats, achievements } = useSynced<Combined>(readCombined);
  const level = computeLevelInfo(stats);
  return { stats, level, rank: computeRankInfo(level), achievements };
}
