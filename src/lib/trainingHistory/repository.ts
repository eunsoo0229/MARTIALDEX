import type { TrainingHistoryEntry } from './types';

const KEY = 'martialdex:training-history';
// Entries used to be genuinely append-only (never edited/deleted after
// creation), so cloud sync only ever needed "does this id exist yet." Now
// that entries can be deleted or have their notes edited, a local delete
// has no way to also delete the Supabase row (no network access here —
// cloudSync/trainingHistorySync.ts owns that), so it's queued as a
// tombstone instead — same pattern as gymRoutine/repository.ts, which
// fixed the identical "deleted item resurrected by the next sync" bug.
const DELETED_KEY = 'martialdex:training-history-deleted';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
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

// Same local-first repository shape as curriculum/repository.ts and
// poseAnalysis/recordsRepository.ts — a flat array under one key plus a
// CustomEvent so every open page (Home, AI 코치, 나의 기술, 기술 상세)
// re-renders when a training session is recorded anywhere.
export const trainingHistoryRepository = {
  list(): TrainingHistoryEntry[] {
    return readJson<TrainingHistoryEntry[]>(KEY, []);
  },
  get(id: string): TrainingHistoryEntry | undefined {
    return this.list().find((e) => e.id === id);
  },
  add(entry: TrainingHistoryEntry): void {
    const list = this.list();
    list.unshift(entry);
    writeJson(KEY, list);
    window.dispatchEvent(new CustomEvent('martialdex:training-history-updated'));
  },
  /** Removes one entry locally and queues its id for cloud deletion (see trainingHistorySync.ts). */
  remove(id: string): void {
    const list = this.list();
    const next = list.filter((e) => e.id !== id);
    if (next.length === list.length) return;
    writeJson(KEY, next);
    const deleted = readDeletedIds();
    deleted[id] = new Date().toISOString();
    writeDeletedIds(deleted);
    window.dispatchEvent(new CustomEvent('martialdex:training-history-updated'));
  },
  /** Patches one entry in place (notes edits) and bumps `updatedAt` so cloud sync knows this side is newer. Returns the updated entry, or undefined if no entry with that id exists. */
  update(id: string, patch: Partial<TrainingHistoryEntry>): TrainingHistoryEntry | undefined {
    const list = this.list();
    const index = list.findIndex((e) => e.id === id);
    if (index === -1) return undefined;
    const updated: TrainingHistoryEntry = { ...list[index], ...patch, id, updatedAt: new Date().toISOString() };
    list[index] = updated;
    writeJson(KEY, list);
    window.dispatchEvent(new CustomEvent('martialdex:training-history-updated'));
    return updated;
  },
  /** Ids deleted locally that still need their Supabase row removed — see trainingHistorySync.ts. */
  listDeletedIds(): string[] {
    return Object.keys(readDeletedIds());
  },
  /** Called once the matching Supabase row is confirmed deleted (or was never there). */
  clearDeleted(id: string): void {
    const deleted = readDeletedIds();
    if (!(id in deleted)) return;
    delete deleted[id];
    writeDeletedIds(deleted);
  },
  /**
   * Cloud-sync pull — inserts entries whose id isn't already present
   * locally, and (additive, for editable entries) overwrites a local entry
   * whose cloud counterpart has a newer `updatedAt` (falling back to
   * `completedAt` for pre-edit-feature rows on either side, so an entry
   * with no `updatedAt` anywhere is still handled — it just never "wins"
   * an update conflict, matching its true never-been-edited state). Never
   * touches an id that's locally tombstoned for deletion (that flush
   * happens separately, before this runs — see trainingHistorySync.ts).
   * Returns how many entries were inserted or overwritten.
   */
  mergeFromCloud(entries: TrainingHistoryEntry[]): number {
    const list = this.list();
    const byId = new Map(list.map((e) => [e.id, e]));
    let changed = 0;
    for (const cloudEntry of entries) {
      const local = byId.get(cloudEntry.id);
      if (!local) {
        byId.set(cloudEntry.id, cloudEntry);
        changed++;
        continue;
      }
      const cloudTime = cloudEntry.updatedAt ?? cloudEntry.completedAt;
      const localTime = local.updatedAt ?? local.completedAt;
      if (cloudTime > localTime) {
        byId.set(cloudEntry.id, cloudEntry);
        changed++;
      }
    }
    if (changed === 0) return 0;
    const merged = [...byId.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    writeJson(KEY, merged);
    window.dispatchEvent(new CustomEvent('martialdex:training-history-updated'));
    return changed;
  },
};
