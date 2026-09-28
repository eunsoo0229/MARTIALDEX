import Fuse from 'fuse.js';
import type { Technique } from '../types';
import { allTechniques, getMartialArt, homeTrainingExercises } from './loadData';

// Extracted out of search.ts so both the synchronous search path (search.ts,
// used by every existing call site — TechniqueList, pickers, etc.) and the
// Worker-backed async path (searchWorker.ts, used only by the live-typing
// SearchBar) can share the exact same corpus/index/ranking rules without
// duplicating them. No behavior here is new — this is a pure extraction.

export interface SearchableTechnique extends Technique {
  martialArtNameKo: string;
  martialArtNameEn: string;
  searchText: string;
}

function buildSearchText(t: Technique): string {
  return [t.description, t.purpose, ...t.principles, ...t.transitions, ...t.counters, ...t.defenses]
    .filter(Boolean)
    .join(' \n ');
}

// Home-training exercises are deliberately excluded from `allTechniques`
// (see loadData.ts) but explicitly opted into search here — a user typing
// "스쿼트" should find it, even though the same exercises must never leak
// into unscoped "search the whole corpus" call sites elsewhere (MMA/
// situational/sparring candidate pools — see the guards on those files).
export const searchCorpus: SearchableTechnique[] = [...allTechniques, ...homeTrainingExercises].map((t) => {
  const art = getMartialArt(t.martialArt);
  return {
    ...t,
    martialArtNameKo: art?.nameKo ?? t.martialArt,
    martialArtNameEn: art?.nameEn ?? '',
    searchText: buildSearchText(t),
  };
});

// Fuzzy fallback (typo tolerance, partial-word matches) — kept as a
// *secondary* source of results. On its own, Fuse's fuzzy distance scoring
// gets unreliable for short Korean queries (a 2-character query fuzzily
// matches all sorts of unrelated short tokens), so exact substring matches
// are always collected and ranked first (see `computeExactMatches` below)
// and Fuse only fills in whatever exact matching didn't already find.
export const fuse = new Fuse(searchCorpus, {
  keys: [
    { name: 'name', weight: 0.32 },
    { name: 'koreanName', weight: 0.24 },
    { name: 'aliases', weight: 0.14 },
    { name: 'martialArtNameKo', weight: 0.07 },
    { name: 'martialArtNameEn', weight: 0.07 },
    { name: 'positions', weight: 0.05 },
    { name: 'category', weight: 0.05 },
    { name: 'tags', weight: 0.03 },
    { name: 'searchText', weight: 0.03 },
  ],
  threshold: 0.2,
  ignoreLocation: true,
  minMatchCharLength: 1,
});

// Ranks an exact (case-insensitive for Latin script) substring hit by which
// field it landed in — a match on the technique's own name/Korean name/alias
// should always outrank a match that only shows up because it's mentioned in
// a shared category description, or three levels deep in transition text.
function exactMatchScore(t: SearchableTechnique, q: string, qLower: string): number {
  if (t.name.toLowerCase().includes(qLower)) return 100;
  if (t.koreanName && t.koreanName.includes(q)) return 95;
  if (t.aliases.some((a) => a.toLowerCase().includes(qLower))) return 85;
  if (t.martialArtNameKo.includes(q) || t.martialArtNameEn.toLowerCase().includes(qLower)) return 80;
  if (t.category.includes(q)) return 65;
  if (t.positions.some((p) => p.includes(q))) return 55;
  if (t.tags.some((tag) => tag.toLowerCase().includes(qLower))) return 50;
  if (t.searchText.includes(q)) return 20;
  return 0;
}

export interface TechniqueFilters {
  martialArt?: string;
  position?: string;
  category?: string;
  difficulty?: string;
  type?: string; // plain "#Tag"-style technique-type tag, see techniqueTypeTags()
}

export function matchesFilters(t: Technique, filters: TechniqueFilters): boolean {
  if (filters.martialArt && t.martialArt !== filters.martialArt) return false;
  if (filters.position && !t.positions.includes(filters.position)) return false;
  if (filters.category && t.category !== filters.category) return false;
  if (filters.difficulty && t.difficulty !== filters.difficulty) return false;
  if (filters.type && !t.tags.includes(filters.type)) return false;
  return true;
}

/**
 * The cheap tier (~2-4ms over the whole ~1,310-entry corpus, measured live)
 * — a plain substring scan, no approximate-string-matching. Exposed so both
 * search.ts's synchronous searchTechniques() and the async/Worker path can
 * compute exact matches synchronously on the main thread (fast enough to
 * never need a worker) and only reach for Fuse when this isn't enough.
 */
export function computeExactMatches(q: string, qLower: string): SearchableTechnique[] {
  const scored = searchCorpus.map((t) => ({ t, score: exactMatchScore(t, q, qLower) })).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score); // stable sort: ties keep corpus order
  return scored.map((x) => x.t);
}
