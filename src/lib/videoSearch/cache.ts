import type { VideoSearchItem } from './types';

// Keyed by techniqueId (not the raw query string) — one cached live-search
// result set per technique, so re-training the same technique never repeats
// the same network search. Deliberately separate from data/curated/
// videos.json and never writes into it — this cache holds only unverified
// live-search results, kept per-session-storage-like but persisted across
// restarts via the same martialdex:-prefixed localStorage convention every
// other local-first module in this app uses (see dataBackup.ts).
const KEY = 'martialdex:youtube-search-cache';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a technique's best tutorial videos rarely change.

interface CacheEntry {
  results: VideoSearchItem[];
  fetchedAt: string;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Best-effort — a full localStorage quota must never break video search.
  }
}

export function getCachedVideoSearch(techniqueId: string): VideoSearchItem[] | null {
  const entry = readCache()[techniqueId];
  if (!entry) return null;
  if (Date.now() - new Date(entry.fetchedAt).getTime() > TTL_MS) return null;
  return entry.results;
}

export function setCachedVideoSearch(techniqueId: string, results: VideoSearchItem[]) {
  const cache = readCache();
  cache[techniqueId] = { results, fetchedAt: new Date().toISOString() };
  writeCache(cache);
}
