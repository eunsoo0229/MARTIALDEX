import { useCallback, useEffect, useState } from 'react';
import type { InterestEvent, InterestEventType, SharedCombo, SharedComboKind } from './types';

// On-device stores for 사용자 콤보:
//  - interest log: what this user opened / hearted / favorited / shared —
//    the input of the 맞춤 추천 ranking (ranking.ts). Never uploaded.
//  - favorites: 콤보·셋업 즐겨찾기, like technique favorites
//    (martialdex:favorites) — a small snapshot so the favorites page works
//    offline and after the author deletes the shared combo.
// Both live under the martialdex: prefix, so they ride the existing account
// backup like every other local setting.

const INTEREST_KEY = 'martialdex:combo-interest';
const INTEREST_LIMIT = 300;
const FAV_KEY = 'martialdex:favorite-combos';
export const COMBO_FAVORITES_EVENT = 'martialdex:favorite-combos-updated';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full — not fatal
  }
}

// ---------------- interest log

export function listInterestEvents(): InterestEvent[] {
  const v = read<InterestEvent[]>(INTEREST_KEY, []);
  return Array.isArray(v) ? v.filter((e) => e && typeof e.comboId === 'string' && typeof e.at === 'number') : [];
}

/** Records one interaction. Repeated opens of the same combo within 10 minutes count once. */
export function recordInterest(type: InterestEventType, c: Pick<SharedCombo, 'id' | 'kind' | 'purposeTags' | 'techniqueIds' | 'martialArt'>, now = Date.now()): void {
  const events = listInterestEvents();
  if (type === 'view' && events.some((e) => e.type === 'view' && e.comboId === c.id && now - e.at < 10 * 60000)) return;
  events.push({ type, comboId: c.id, kind: c.kind, purposeTags: c.purposeTags, techniqueIds: c.techniqueIds, martialArt: c.martialArt, at: now });
  write(INTEREST_KEY, events.slice(-INTEREST_LIMIT));
}

// ---------------- favorites

export interface FavoriteCombo {
  id: string;
  kind: SharedComboKind;
  name: string;
  purpose: string;
  authorNickname: string;
  stepNames: string[];
  savedAt: string;
}

export function listFavoriteCombos(): FavoriteCombo[] {
  const v = read<FavoriteCombo[]>(FAV_KEY, []);
  return Array.isArray(v) ? v.filter((f) => f && typeof f.id === 'string') : [];
}

export function isFavoriteCombo(id: string): boolean {
  return listFavoriteCombos().some((f) => f.id === id);
}

/** Toggles; returns true when it is now a favorite. */
export function toggleFavoriteCombo(c: SharedCombo): boolean {
  const list = listFavoriteCombos();
  const on = !list.some((f) => f.id === c.id);
  const next = on
    ? [{ id: c.id, kind: c.kind, name: c.name, purpose: c.purpose, authorNickname: c.authorNickname, stepNames: c.steps.map((s) => s.name), savedAt: new Date().toISOString() }, ...list]
    : list.filter((f) => f.id !== c.id);
  write(FAV_KEY, next);
  if (on) recordInterest('favorite', c);
  window.dispatchEvent(new CustomEvent(COMBO_FAVORITES_EVENT));
  return on;
}

export function removeFavoriteCombo(id: string): void {
  write(FAV_KEY, listFavoriteCombos().filter((f) => f.id !== id));
  window.dispatchEvent(new CustomEvent(COMBO_FAVORITES_EVENT));
}

export function useFavoriteCombos(): FavoriteCombo[] {
  const [list, setList] = useState<FavoriteCombo[]>(listFavoriteCombos);
  const refresh = useCallback(() => setList(listFavoriteCombos()), []);
  useEffect(() => {
    window.addEventListener(COMBO_FAVORITES_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(COMBO_FAVORITES_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);
  return list;
}
