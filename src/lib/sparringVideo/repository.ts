import type { SparringVideo } from './types';

// Metadata-only local-first store, same shape as every other repository in
// this codebase (trainingHistory/curriculum/nutrition/...) — a flat JSON
// array under one localStorage key + a CustomEvent so any open screen
// re-renders when a video is recorded/deleted elsewhere. No cloud sync in
// this phase (see plan) — the actual video binaries stay device-local, so
// there's no tombstone/deleted-ids tracking to reconcile against a remote
// copy like the synced repositories need.
const KEY = 'martialdex:sparring-videos';
export const SPARRING_VIDEOS_UPDATED_EVENT = 'martialdex:sparring-videos-updated';

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

export const sparringVideoRepository = {
  list(): SparringVideo[] {
    return readJson<SparringVideo[]>(KEY, []);
  },
  get(id: string): SparringVideo | undefined {
    return this.list().find((v) => v.id === id);
  },
  add(video: SparringVideo): void {
    const list = this.list();
    list.unshift(video);
    writeJson(KEY, list);
    window.dispatchEvent(new CustomEvent(SPARRING_VIDEOS_UPDATED_EVENT));
  },
  update(id: string, patch: Partial<SparringVideo>): SparringVideo | undefined {
    const list = this.list();
    const index = list.findIndex((v) => v.id === id);
    if (index === -1) return undefined;
    const updated: SparringVideo = { ...list[index], ...patch, id };
    list[index] = updated;
    writeJson(KEY, list);
    window.dispatchEvent(new CustomEvent(SPARRING_VIDEOS_UPDATED_EVENT));
    return updated;
  },
  remove(id: string): void {
    const list = this.list();
    const next = list.filter((v) => v.id !== id);
    if (next.length === list.length) return;
    writeJson(KEY, next);
    window.dispatchEvent(new CustomEvent(SPARRING_VIDEOS_UPDATED_EVENT));
  },
};
