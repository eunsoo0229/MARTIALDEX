import type { NutritionMealEntry } from './types';

// Same local-first repository shape as trainingHistory/repository.ts and
// gymRoutine/repository.ts — flat array under one key, a delete-tombstone
// list so a locally-deleted meal can't be resurrected by the next cloud
// sync (see cloudSync/trainingHistorySync.ts's identical fix), and a
// CustomEvent dispatched on every write so LocalDataMigrationPrompt.tsx's
// debounced listener can push to Supabase without a sync call at every
// call site.
const KEY = 'martialdex:nutrition-meals';
const DELETED_KEY = 'martialdex:nutrition-meals-deleted';
const EVENT = 'martialdex:nutrition-meals-updated';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readDeletedIds(): Record<string, string> {
  return readJson<Record<string, string>>(DELETED_KEY, {});
}

function writeDeletedIds(ids: Record<string, string>) {
  writeJson(DELETED_KEY, ids);
}

export const nutritionMealRepository = {
  list(): NutritionMealEntry[] {
    return readJson<NutritionMealEntry[]>(KEY, []);
  },
  get(id: string): NutritionMealEntry | undefined {
    return this.list().find((m) => m.id === id);
  },
  add(meal: NutritionMealEntry): void {
    const list = this.list();
    list.unshift(meal);
    writeJson(KEY, list);
    window.dispatchEvent(new CustomEvent(EVENT));
  },
  update(id: string, patch: Partial<NutritionMealEntry>): NutritionMealEntry | undefined {
    const list = this.list();
    const index = list.findIndex((m) => m.id === id);
    if (index === -1) return undefined;
    const updated: NutritionMealEntry = { ...list[index], ...patch, id, updatedAt: new Date().toISOString() };
    list[index] = updated;
    writeJson(KEY, list);
    window.dispatchEvent(new CustomEvent(EVENT));
    return updated;
  },
  remove(id: string): void {
    const list = this.list();
    const next = list.filter((m) => m.id !== id);
    if (next.length === list.length) return;
    writeJson(KEY, next);
    const deleted = readDeletedIds();
    deleted[id] = new Date().toISOString();
    writeDeletedIds(deleted);
    window.dispatchEvent(new CustomEvent(EVENT));
  },
  listDeletedIds(): string[] {
    return Object.keys(readDeletedIds());
  },
  clearDeleted(id: string): void {
    const deleted = readDeletedIds();
    if (!(id in deleted)) return;
    delete deleted[id];
    writeDeletedIds(deleted);
  },
  /** Cloud pull merge — insert-if-missing, overwrite-if-cloud-is-newer (updatedAt falling back to createdAt), mirroring trainingHistory/repository.ts's mergeFromCloud. */
  mergeFromCloud(entries: NutritionMealEntry[]): number {
    const list = this.list();
    const byId = new Map(list.map((m) => [m.id, m]));
    let changed = 0;
    for (const cloudEntry of entries) {
      const local = byId.get(cloudEntry.id);
      if (!local) {
        byId.set(cloudEntry.id, cloudEntry);
        changed++;
        continue;
      }
      const cloudTime = cloudEntry.updatedAt ?? cloudEntry.createdAt;
      const localTime = local.updatedAt ?? local.createdAt;
      if (cloudTime > localTime) {
        byId.set(cloudEntry.id, cloudEntry);
        changed++;
      }
    }
    if (changed === 0) return 0;
    const merged = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    writeJson(KEY, merged);
    window.dispatchEvent(new CustomEvent(EVENT));
    return changed;
  },
};

export { EVENT as NUTRITION_MEALS_EVENT };
