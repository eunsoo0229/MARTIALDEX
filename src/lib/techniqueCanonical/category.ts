import categoryData from '../../../data/curated/category-canonical.json';
import { getMartialArt } from '../loadData';

// Canonical categories. For every official art the canonical set is that
// art's own official categories (the encyclopedia's section headings) —
// never a new invented one. A category written by AI for a shared-library /
// requested technique ("escape", "Escapes / Reversals", "conditioning/
// warm-up"...) is filed into one of them:
//   1. reviewed per-record reclassification (category-canonical.json records),
//   2. same category in another spelling/language ("escape" ↔ "탈출 (Escape)",
//      "Escapes" ↔ "Escape", case, punctuation),
//   3. ordered keyword rules on the raw category + technique name,
//   4. nothing fits → null, and the caller decides (a request may then
//      propose a genuinely new category — see resolveRequestedCategory).
// Arts with no official categories (user-added arts like 우슈) only get
// spelling unification against what that art already uses.

interface CategoryData {
  records: Record<string, string>;
  rules: Record<string, [string, string][]>;
}
const data = categoryData as unknown as CategoryData;
const compiledRules = new Map<string, { re: RegExp; category: string }[]>();
for (const [art, rules] of Object.entries(data.rules)) compiledRules.set(art, rules.map(([pattern, category]) => ({ re: new RegExp(pattern, 'i'), category })));

export function normalizeCategoryKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/(es|s)$/u, '');
}

/** Every spelling a category can be referred by: whole, its Korean head, its parenthesised English, each "/" or "---" part. */
function categoryKeys(category: string): string[] {
  const parts = [category, category.replace(/\(.*?\)/g, ''), ...[...category.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]), ...category.split(/---|\//)];
  return [...new Set(parts.map(normalizeCategoryKey).filter((k) => k.length >= 2))];
}

export function officialCategoriesOf(martialArtId: string): string[] {
  return getMartialArt(martialArtId)?.categories ?? [];
}

/** Exact-meaning match only (spelling / language / plural / case), no keyword guessing. */
export function matchOfficialCategory(martialArtId: string, raw: string): string | null {
  const official = officialCategoriesOf(martialArtId);
  if (official.includes(raw)) return raw;
  const rawKey = normalizeCategoryKey(raw);
  if (!rawKey) return null;
  for (const c of official) if (normalizeCategoryKey(c) === rawKey) return c;
  // A part-level match must be unambiguous — "escape" may match only one category.
  const hits = official.filter((c) => categoryKeys(c).includes(rawKey));
  return hits.length === 1 ? hits[0] : null;
}

export function canonicalCategoryFor(martialArtId: string, raw: string, technique?: { id?: string; name?: string; koreanName?: string | null }): string | null {
  const official = officialCategoriesOf(martialArtId);
  if (official.length === 0) return null;
  const reviewed = technique?.id ? data.records[technique.id] : undefined;
  if (reviewed && official.includes(reviewed)) return reviewed;
  const exact = matchOfficialCategory(martialArtId, raw);
  if (exact) return exact;
  const hay = `${raw} ${technique?.name ?? ''} ${technique?.koreanName ?? ''}`;
  for (const r of compiledRules.get(martialArtId) ?? []) if (r.re.test(hay) && official.includes(r.category)) return r.category;
  return null;
}

/**
 * For arts without official categories: reuse the spelling the art already
 * uses for the same category ("Kick" → existing "kick"), so case/plural
 * variants never split a category.
 */
export function unifyCustomCategory(raw: string, existing: string[]): string {
  const key = normalizeCategoryKey(raw);
  return existing.find((c) => normalizeCategoryKey(c) === key) ?? raw.trim();
}
