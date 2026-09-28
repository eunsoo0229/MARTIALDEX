import type { Combo } from './types';

// Same martialdex:-prefixed localStorage + CustomEvent pattern as every
// other local-first module (curriculum/repository.ts, userTechniques/
// repository.ts, etc.) — works offline/logged-out, rides the generic
// backup blob automatically, and gets the dedicated Supabase table sync in
// cloudSync/comboSync.ts on top of that.
const KEY = 'martialdex:combos';
const EVENT = 'martialdex:combos-updated';

function readAll(): Combo[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Combo[]) : [];
  } catch {
    return [];
  }
}

function writeAll(combos: Combo[]) {
  window.localStorage.setItem(KEY, JSON.stringify(combos));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const comboRepository = {
  list(): Combo[] {
    return readAll();
  },
  get(id: string): Combo | undefined {
    return readAll().find((c) => c.id === id);
  },
  save(combo: Combo): void {
    const all = readAll();
    const idx = all.findIndex((c) => c.id === combo.id);
    if (idx >= 0) all[idx] = combo;
    else all.unshift(combo);
    writeAll(all);
  },
  delete(id: string): void {
    writeAll(readAll().filter((c) => c.id !== id));
  },
};
