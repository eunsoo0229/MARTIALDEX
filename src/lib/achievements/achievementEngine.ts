import { collectProfileStats, type ProfileStatsInput } from '../profileStats/collectProfileStats';
import { ACHIEVEMENT_DEFS } from './definitions';
import { readUnlockStore, writeUnlockStore } from './unlockStore';

export interface AchievementStatus {
  id: string;
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progressCurrent: number;
  progressTarget: number;
}

export function computeAchievementStatuses(stats: ProfileStatsInput = collectProfileStats()): AchievementStatus[] {
  const unlockMap = readUnlockStore();
  let changed = false;

  const statuses = ACHIEVEMENT_DEFS.map((def) => {
    const current = Math.min(def.current(stats), def.target);
    const unlocked = current >= def.target;
    let unlockedAt = unlockMap[def.id] ?? null;
    if (unlocked && !unlockedAt) {
      unlockedAt = new Date().toISOString();
      unlockMap[def.id] = unlockedAt;
      changed = true;
    }
    return {
      id: def.id,
      icon: def.icon,
      title: def.title,
      description: def.description,
      unlocked,
      unlockedAt,
      progressCurrent: current,
      progressTarget: def.target,
    };
  });

  if (changed) writeUnlockStore(unlockMap);
  return statuses;
}
