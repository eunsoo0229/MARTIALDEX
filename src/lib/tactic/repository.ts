import type { Tactic } from './types';

// Same martialdex:-prefixed localStorage + CustomEvent pattern as
// combo/repository.ts / userTechniques/repository.ts.
const KEY = 'martialdex:tactics';
const EVENT = 'martialdex:tactics-updated';

function readAll(): Tactic[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tactic[]) : [];
  } catch {
    return [];
  }
}

function writeAll(tactics: Tactic[]) {
  window.localStorage.setItem(KEY, JSON.stringify(tactics));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const tacticRepository = {
  list(): Tactic[] {
    return readAll();
  },
  get(id: string): Tactic | undefined {
    return readAll().find((t) => t.id === id);
  },
  save(tactic: Tactic): void {
    const all = readAll();
    const idx = all.findIndex((t) => t.id === tactic.id);
    if (idx >= 0) all[idx] = tactic;
    else all.unshift(tactic);
    writeAll(all);
  },
  delete(id: string): void {
    writeAll(readAll().filter((t) => t.id !== id));
  },
};
