const KEY = 'martialdex:achievements-unlocked';

// Records ONLY the first moment computeAchievementStatuses() detected each
// achievement's real condition already met — an honest "first observed"
// timestamp, not a retroactively fabricated unlock date. Never stores
// anything for an achievement that hasn't actually been earned.
export function readUnlockStore(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeUnlockStore(map: Record<string, string>): void {
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent('martialdex:achievements-updated'));
}
