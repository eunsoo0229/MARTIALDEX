import type { TechniqueVideoPick } from './types';

// Same martialdex:-prefixed localStorage + CustomEvent pattern as every
// other local-first module (curriculum/repository.ts, combo/repository.ts,
// etc.) — keyed by techniqueId (not a random id), since a user has at most
// one pick per technique.
const KEY = 'martialdex:technique-video-picks';
const DELETED_KEY = 'martialdex:technique-video-picks-deleted';
const EVENT = 'martialdex:technique-video-picks-updated';

function readAll(): Record<string, TechniqueVideoPick> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, TechniqueVideoPick>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, TechniqueVideoPick>) {
  window.localStorage.setItem(KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function readDeleted(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(DELETED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDeleted(deleted: Record<string, string>) {
  window.localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));
}

export const techniqueVideoPickRepository = {
  list(): TechniqueVideoPick[] {
    return Object.values(readAll());
  },
  get(techniqueId: string): TechniqueVideoPick | undefined {
    return readAll()[techniqueId];
  },
  save(pick: TechniqueVideoPick): void {
    const all = readAll();
    all[pick.techniqueId] = pick;
    writeAll(all);
    // A fresh save always supersedes any pending delete tombstone for the
    // same id (spec: picking a new video after clearing one shouldn't have
    // a stale cloud-delete queued behind it).
    const deleted = readDeleted();
    if (pick.techniqueId in deleted) {
      delete deleted[pick.techniqueId];
      writeDeleted(deleted);
    }
  },
  saveMany(picks: TechniqueVideoPick[]): void {
    if (picks.length === 0) return;
    const all = readAll();
    for (const p of picks) all[p.techniqueId] = p;
    writeAll(all);
  },
  delete(techniqueId: string): void {
    const all = readAll();
    delete all[techniqueId];
    writeAll(all);
    // Tombstone so cloudSync's pull loop never resurrects a cleared pick —
    // see cloudSync/curriculumSync.ts's doc comment for the exact race this
    // guards against (this domain is built with the fix from day one
    // instead of needing it patched in later).
    const deleted = readDeleted();
    deleted[techniqueId] = new Date().toISOString();
    writeDeleted(deleted);
  },
  listDeletedIds(): string[] {
    return Object.keys(readDeleted());
  },
  clearDeleted(techniqueId: string): void {
    const deleted = readDeleted();
    if (!(techniqueId in deleted)) return;
    delete deleted[techniqueId];
    writeDeleted(deleted);
  },
};
