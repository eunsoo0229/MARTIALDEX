import type { Curriculum, CurriculumProgress } from './types';

const CUSTOM_KEY = 'martialdex:curricula:custom';
const PROGRESS_KEY = 'martialdex:curricula:progress';
const AUTHOR_NAME_KEY = 'martialdex:curricula:author-name';
// Deletions made here have no network access to also delete the matching
// Supabase row (cloudSync/curriculumSync.ts owns the network) — without a
// tombstone, syncCurriculaBidirectional's pull loop sees "cloud still has
// this id, local doesn't" and treats that as "cloud has something new",
// silently re-pulling (resurrecting) the just-deleted curriculum within the
// ~800ms debounce window LocalDataMigrationPrompt.tsx's listener runs on.
// Same fix already applied to trainingHistory/gymRoutine/nutrition-meals
// repositories earlier — curriculum was missed until now.
const DELETED_KEY = 'martialdex:curricula:deleted';

// The contract every part of the app talks to. Today only
// LocalCurriculumRepository exists (this project has no user accounts or
// server DB — see README "커리큘럼 공유" for why we didn't bolt one on just
// for this). When real cross-device sharing is needed, a
// RemoteCurriculumRepository implementing this same interface (e.g. backed
// by Firebase/Supabase) can be swapped in via curriculumService.ts without
// any UI component changing — the UI only ever calls the service, never
// localStorage directly.
export interface CurriculumRepository {
  listCustom(): Curriculum[];
  getCustom(id: string): Curriculum | undefined;
  saveCustom(curriculum: Curriculum): void;
  /** Same effect as calling saveCustom() once per item, but reads/writes CUSTOM_KEY exactly once total instead of once per item — see cloudSync/curriculumSync.ts's pull loops, which used to call saveCustom() per row (an N-item pull did N full reads + N full writes of the whole custom-curricula array). */
  saveManyCustom(curricula: Curriculum[]): void;
  deleteCustom(id: string): void;
  /** Ids deleted locally that still need their Supabase row removed — see cloudSync/curriculumSync.ts. */
  listDeletedIds(): string[];
  /** Called once the matching Supabase row is confirmed deleted (or was never there). */
  clearDeleted(id: string): void;

  listProgress(): CurriculumProgress[];
  getProgress(curriculumId: string): CurriculumProgress | undefined;
  saveProgress(progress: CurriculumProgress): void;
  /** Batch version of saveProgress() — same one-read/one-write-total rationale as saveManyCustom(). */
  saveManyProgress(progresses: CurriculumProgress[]): void;

  getAuthorName(): string;
  setAuthorName(name: string): void;
}

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

class LocalCurriculumRepository implements CurriculumRepository {
  listCustom(): Curriculum[] {
    return readJson<Curriculum[]>(CUSTOM_KEY, []);
  }

  getCustom(id: string): Curriculum | undefined {
    return this.listCustom().find((c) => c.id === id);
  }

  saveCustom(curriculum: Curriculum): void {
    const list = this.listCustom();
    const idx = list.findIndex((c) => c.id === curriculum.id);
    if (idx >= 0) list[idx] = curriculum;
    else list.unshift(curriculum);
    writeJson(CUSTOM_KEY, list);
    window.dispatchEvent(new CustomEvent('martialdex:curricula-updated'));
  }

  saveManyCustom(curricula: Curriculum[]): void {
    if (curricula.length === 0) return;
    const list = this.listCustom();
    const byId = new Map(list.map((c, i) => [c.id, i]));
    const newItems: Curriculum[] = [];
    for (const curriculum of curricula) {
      const idx = byId.get(curriculum.id);
      if (idx !== undefined) list[idx] = curriculum;
      else newItems.push(curriculum);
    }
    // Matches saveCustom()'s per-call unshift() ordering: calling it once
    // per item front-inserts each in turn, so the LAST new item ends up
    // first — reversing this batch's collected new items before prepending
    // reproduces that same final order.
    const merged = [...newItems.reverse(), ...list];
    writeJson(CUSTOM_KEY, merged);
    window.dispatchEvent(new CustomEvent('martialdex:curricula-updated'));
  }

  deleteCustom(id: string): void {
    writeJson(CUSTOM_KEY, this.listCustom().filter((c) => c.id !== id));
    const progress = readJson<Record<string, CurriculumProgress>>(PROGRESS_KEY, {});
    delete progress[id];
    writeJson(PROGRESS_KEY, progress);
    const deleted = readJson<Record<string, string>>(DELETED_KEY, {});
    deleted[id] = new Date().toISOString();
    writeJson(DELETED_KEY, deleted);
    window.dispatchEvent(new CustomEvent('martialdex:curricula-updated'));
  }

  listDeletedIds(): string[] {
    return Object.keys(readJson<Record<string, string>>(DELETED_KEY, {}));
  }

  clearDeleted(id: string): void {
    const deleted = readJson<Record<string, string>>(DELETED_KEY, {});
    if (!(id in deleted)) return;
    delete deleted[id];
    writeJson(DELETED_KEY, deleted);
  }

  listProgress(): CurriculumProgress[] {
    return Object.values(readJson<Record<string, CurriculumProgress>>(PROGRESS_KEY, {}));
  }

  getProgress(curriculumId: string): CurriculumProgress | undefined {
    return readJson<Record<string, CurriculumProgress>>(PROGRESS_KEY, {})[curriculumId];
  }

  saveProgress(progress: CurriculumProgress): void {
    const all = readJson<Record<string, CurriculumProgress>>(PROGRESS_KEY, {});
    all[progress.curriculumId] = progress;
    writeJson(PROGRESS_KEY, all);
    window.dispatchEvent(new CustomEvent('martialdex:progress-updated'));
  }

  saveManyProgress(progresses: CurriculumProgress[]): void {
    if (progresses.length === 0) return;
    const all = readJson<Record<string, CurriculumProgress>>(PROGRESS_KEY, {});
    for (const progress of progresses) all[progress.curriculumId] = progress;
    writeJson(PROGRESS_KEY, all);
    window.dispatchEvent(new CustomEvent('martialdex:progress-updated'));
  }

  getAuthorName(): string {
    return window.localStorage.getItem(AUTHOR_NAME_KEY) || '나';
  }

  setAuthorName(name: string): void {
    window.localStorage.setItem(AUTHOR_NAME_KEY, name);
  }
}

export const curriculumRepository: CurriculumRepository = new LocalCurriculumRepository();
