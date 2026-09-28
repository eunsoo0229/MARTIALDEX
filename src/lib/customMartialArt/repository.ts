import type { CustomMartialArt } from './types';

// Same "local, synchronous cache of shared data" pattern as addTeq/repository.ts
// — required because getUnifiedMartialArtSummaries()/getUnifiedMartialArt()
// (userTechniques/service.ts) are called synchronously from render paths all
// over the app. Supabase stays the source of truth (see service.ts's
// pullCustomMartialArtsFromCloud/insertCustomMartialArt); this cache is only
// ever refreshed by pulling from there.
const KEY = 'martialdex:custom-martial-arts-cache';
const EVENT = 'martialdex:custom-martial-arts-cache-updated';

function readAll(): CustomMartialArt[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CustomMartialArt[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: CustomMartialArt[]) {
  window.localStorage.setItem(KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const customMartialArtRepository = {
  list(): CustomMartialArt[] {
    return readAll();
  },
  get(id: string): CustomMartialArt | undefined {
    return readAll().find((r) => r.id === id);
  },
  upsertMany(records: CustomMartialArt[]): void {
    if (records.length === 0) return;
    const current = readAll();
    const byId = new Map(current.map((r) => [r.id, r]));
    for (const r of records) byId.set(r.id, r);
    writeAll([...byId.values()]);
  },
  upsertOne(record: CustomMartialArt): void {
    this.upsertMany([record]);
  },
};

export { KEY as CUSTOM_MARTIAL_ART_CACHE_KEY, EVENT as CUSTOM_MARTIAL_ART_CACHE_EVENT };
