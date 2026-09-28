import type { Technique } from '../types';
import { computeExactMatches, fuse, matchesFilters, searchCorpus, type TechniqueFilters } from './searchCore';
import { getSearchWorker } from './searchWorker';

export type { TechniqueFilters } from './searchCore';

export function searchTechniques(query: string, limit = 30, filters: TechniqueFilters = {}): Technique[] {
  const q = query.trim();
  let ranked: Technique[];

  if (!q) {
    ranked = searchCorpus;
  } else {
    const qLower = q.toLowerCase();
    const exact = computeExactMatches(q, qLower);
    const seen = new Set(exact.map((t) => t.id));
    // Fuse's fuzzy pass is the expensive part of this function (measured
    // live: ~50-210ms per call vs ~2-4ms for the exact-match loop above,
    // because Fuse does approximate string matching across every weighted
    // key — including the free-text `searchText` field — for all ~1,310
    // corpus entries). Fuzzy results only ever fill in AFTER exact matches
    // in `ranked` below, so once exact matches alone already meet `limit`,
    // every fuzzy result would be discarded by the final `.slice(0, limit)`
    // anyway — skipping the search in that case changes nothing about which
    // results are returned, only how they're computed.
    const filteredExactCount = limit > 0 ? exact.reduce((n, t) => (matchesFilters(t, filters) ? n + 1 : n), 0) : Infinity;
    const fuzzy = limit > 0 && filteredExactCount >= limit ? [] : fuse.search(q).map((r) => r.item);
    ranked = [...exact, ...fuzzy.filter((t) => !seen.has(t.id))];
  }

  const results = ranked.filter((t) => matchesFilters(t, filters));
  return limit > 0 ? results.slice(0, limit) : results;
}

const corpusById = new Map(searchCorpus.map((t) => [t.id, t]));

/**
 * Async, Worker-backed variant for the live-typing SearchBar specifically.
 * Behaves identically to searchTechniques() for a non-empty query (same
 * ranking, same results) but runs Fuse's fuzzy fallback off the main
 * thread — measured on throttled hardware, a single Fuse.search() call over
 * this corpus can still block the main thread for over a second when it
 * actually needs to run (typos / very short queries / few exact matches),
 * long enough to freeze typing/scrolling even with debouncing (which only
 * reduces how OFTEN it runs, not its per-call cost). The exact-match tier
 * (the fast, common-case path) still runs synchronously here — only the
 * expensive fallback is deferred to the worker, which only ever returns
 * ids (never full Technique objects, to keep the postMessage payload
 * small) resolved back against this same corpus. Falls back to the
 * synchronous Fuse call if the worker is unavailable/fails for any reason.
 */
export async function searchTechniquesAsync(query: string, limit = 30, filters: TechniqueFilters = {}): Promise<Technique[]> {
  const q = query.trim();
  if (!q) return searchCorpus.filter((t) => matchesFilters(t, filters)).slice(0, limit > 0 ? limit : undefined);

  const qLower = q.toLowerCase();
  const exact = computeExactMatches(q, qLower);
  const seen = new Set(exact.map((t) => t.id));
  const filteredExactCount = limit > 0 ? exact.reduce((n, t) => (matchesFilters(t, filters) ? n + 1 : n), 0) : Infinity;

  let fuzzy: Technique[];
  if (limit > 0 && filteredExactCount >= limit) {
    fuzzy = [];
  } else {
    try {
      const fuzzyIds = await getSearchWorker().search(q);
      fuzzy = fuzzyIds.map((id) => corpusById.get(id)).filter((t) => t !== undefined);
    } catch {
      // Worker unavailable/failed to init/timed out — degrade to the
      // synchronous path rather than hang forever. Same cost as before this
      // fix existed, just an honest fallback instead of a broken feature.
      fuzzy = fuse.search(q).map((r) => r.item);
    }
  }

  const ranked = [...exact, ...fuzzy.filter((t) => !seen.has(t.id))];
  const results = ranked.filter((t) => matchesFilters(t, filters));
  return limit > 0 ? results.slice(0, limit) : results;
}

// Every technique-classification hashtag that isn't one of the synthetic
// `martialArt:`/`category:` tags step 2 always attaches — these plain tags
// (#Sweep, #Choke, #LowKick, ...) come from each source document's own tag
// vocabulary, so they double as a real "technique type" signal without
// inventing a new taxonomy.
export function techniqueTypeTags(t: Technique): string[] {
  return t.tags.filter((tag) => tag.startsWith('#'));
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'ko'));
}
