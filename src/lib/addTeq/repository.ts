import type { AddTeqRecord } from './types';

// Local, synchronous cache of the shared add_teq library — required
// because every existing resolver this needs to plug into
// (resolveTechnique/resolveTechniquesByIds/searchAllTechniques in
// userTechniques/service.ts) is called synchronously from render paths all
// over the app (technique detail, combo, free training, curriculum...).
// Supabase itself stays the source of truth (see service.ts's
// pullAddTeqFromCloud/insertAddTeqTechnique); this cache is only ever
// refreshed by pulling from there, never edited independently — same
// "local-first cache of shared data" role dataBackup.ts's cloud restore
// plays for user_backups, just automatic instead of user-triggered.
const KEY = 'martialdex:add-teq-cache';
const EVENT = 'martialdex:add-teq-cache-updated';

function readAll(): AddTeqRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AddTeqRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: AddTeqRecord[]) {
  window.localStorage.setItem(KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const addTeqRepository = {
  list(): AddTeqRecord[] {
    return readAll();
  },
  get(id: string): AddTeqRecord | undefined {
    return readAll().find((r) => r.id === id);
  },
  /** Replaces-or-adds by id — used both for a fresh cloud pull and for a single just-registered record. */
  upsertMany(records: AddTeqRecord[]): void {
    if (records.length === 0) return;
    const current = readAll();
    const byId = new Map(current.map((r) => [r.id, r]));
    for (const r of records) byId.set(r.id, r);
    writeAll([...byId.values()]);
  },
  upsertOne(record: AddTeqRecord): void {
    this.upsertMany([record]);
  },
};

export { KEY as ADD_TEQ_CACHE_KEY, EVENT as ADD_TEQ_CACHE_EVENT };
