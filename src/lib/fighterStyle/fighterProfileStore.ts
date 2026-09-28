import type { FighterStyleAnalysis } from './types';

// Caches generated style analyses by fighterId — same localStorage
// convention as the rest of the app (martialdex:* keys). Prevents
// re-spending free-tier Gemini calls every time the user revisits a fighter
// they've already analyzed in this browser profile.
const STORE_KEY = 'martialdex:fighter-styles';

function readAll(): Record<string, FighterStyleAnalysis> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, FighterStyleAnalysis>) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(map));
}

export function getCachedStyleAnalysis(fighterId: string): FighterStyleAnalysis | undefined {
  return readAll()[fighterId];
}

export function cacheStyleAnalysis(analysis: FighterStyleAnalysis): void {
  const all = readAll();
  all[analysis.fighterId] = analysis;
  writeAll(all);
}

export function listCachedStyleAnalyses(): FighterStyleAnalysis[] {
  return Object.values(readAll()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}
