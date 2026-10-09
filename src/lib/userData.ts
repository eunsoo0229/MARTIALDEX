import { useCallback, useEffect, useState } from 'react';
import { canonicalTechniqueId } from './techniqueCanonical';

const FAVORITES_KEY = 'martialdex:favorites';
const RECENT_KEY = 'martialdex:recent';
const RECENT_LIMIT = 12;

function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Ids are canonicalized (a favorite saved as bjj__granby-roll is the
    // canonical Granby Roll) and de-duplicated, order kept.
    return Array.isArray(parsed) ? [...new Set(parsed.filter((x): x is string => typeof x === 'string').map(canonicalTechniqueId))] : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  window.localStorage.setItem(key, JSON.stringify(list));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAVORITES_KEY));

  const isFavorite = useCallback((id: string) => favorites.includes(canonicalTechniqueId(id)), [favorites]);

  const toggleFavorite = useCallback((rawId: string) => {
    const id = canonicalTechniqueId(rawId);
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      writeList(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  return { favorites, isFavorite, toggleFavorite };
}

// Records a technique view from outside a component render (e.g. inside a
// route effect) without needing the full hook's re-render subscription.
export function recordRecentlyViewed(rawId: string) {
  const id = canonicalTechniqueId(rawId);
  const list = readList(RECENT_KEY);
  const next = [id, ...list.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  writeList(RECENT_KEY, next);
  window.dispatchEvent(new CustomEvent('martialdex:recent-updated'));
}

export function useRecentlyViewedSynced() {
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY));
  useEffect(() => {
    const onUpdate = () => setRecent(readList(RECENT_KEY));
    window.addEventListener('martialdex:recent-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:recent-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);
  return recent;
}
