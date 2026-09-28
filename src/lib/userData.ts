import { useCallback, useEffect, useState } from 'react';

const FAVORITES_KEY = 'martialdex:favorites';
const RECENT_KEY = 'martialdex:recent';
const RECENT_LIMIT = 12;

function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  window.localStorage.setItem(key, JSON.stringify(list));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAVORITES_KEY));

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const toggleFavorite = useCallback((id: string) => {
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
export function recordRecentlyViewed(id: string) {
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
