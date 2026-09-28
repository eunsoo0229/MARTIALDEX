import type { UserTechniqueRecord } from './types';

// Same martialdex:-prefixed localStorage + CustomEvent pattern as every
// other local-first module (curriculum/repository.ts, trainingHistory/
// repository.ts, etc.) — works offline/logged-out, and rides the existing
// generic backup blob (dataBackup.ts scans every martialdex:* key) even
// before the dedicated Supabase table sync (see cloudSync/userTechniqueSync.ts) runs.
const KEY = 'martialdex:user-techniques';
const EVENT = 'martialdex:user-techniques-updated';

function readAll(): UserTechniqueRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UserTechniqueRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: UserTechniqueRecord[]) {
  window.localStorage.setItem(KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const userTechniqueRepository = {
  list(): UserTechniqueRecord[] {
    return readAll();
  },
  get(id: string): UserTechniqueRecord | undefined {
    return readAll().find((r) => r.id === id);
  },
  save(record: UserTechniqueRecord): void {
    const all = readAll();
    const idx = all.findIndex((r) => r.id === record.id);
    if (idx >= 0) all[idx] = record;
    else all.unshift(record);
    writeAll(all);
  },
  delete(id: string): void {
    writeAll(readAll().filter((r) => r.id !== id));
  },
};
