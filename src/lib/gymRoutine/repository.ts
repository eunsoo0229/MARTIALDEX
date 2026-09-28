import type { GymRoutine, GymRoutineExerciseTarget } from './types';

// Same martialdex:-prefixed localStorage + CustomEvent pattern as every
// other local-first module (combo/repository.ts, curriculum/repository.ts,
// etc.) — works offline/logged-out, gets the dedicated Supabase table sync
// in cloudSync/gymRoutineSync.ts on top of that.
const KEY = 'martialdex:gym-routines';
const EVENT = 'martialdex:gym-routines-updated';
// Deletions made here have no network access to also delete the Supabase
// row (cloudSync/gymRoutineSync.ts owns the network), so a delete is queued
// as a tombstone (id -> deletedAt) instead. The sync's pull loop treats "no
// local copy" as "cloud has something new" — without this, the surviving
// cloud row would get re-pulled and resurrect the routine the very next
// sync (which fires within ~800ms of any local change, per
// LocalDataMigrationPrompt.tsx's debounce). The sync module flushes and
// clears each tombstone once the matching Supabase row is actually deleted.
const DELETED_KEY = 'martialdex:gym-routines-deleted';

function readDeletedIds(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(DELETED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDeletedIds(ids: Record<string, string>) {
  window.localStorage.setItem(DELETED_KEY, JSON.stringify(ids));
}

// targetReps used to be a single `number | null` shared by every set;
// existing localStorage rows (and any cloud row pulled from an older
// client — gymRoutineSync.ts's pull path calls save(), below) may still
// have that legacy scalar shape. This upgrades it in place to the current
// per-set `(number | null)[]` (length === targetSets) so every other reader
// can assume the array shape unconditionally.
// Shared by targetReps and (below) targetWeightKg — both went through the
// exact same scalar -> per-set-array migration, just at different times.
function normalizePerSetArray(raw: unknown, sets: number): (number | null)[] {
  if (Array.isArray(raw)) {
    const arr = raw.slice(0, sets) as (number | null)[];
    while (arr.length < sets) arr.push(arr[arr.length - 1] ?? null);
    return arr;
  }
  const scalar = (raw as number | null) ?? null;
  return Array.from({ length: sets }, () => scalar);
}

function normalizeTarget(target: GymRoutineExerciseTarget): GymRoutineExerciseTarget {
  const sets = Math.max(1, target.targetSets || 1);
  return {
    ...target,
    targetReps: normalizePerSetArray(target.targetReps, sets),
    // targetWeightKg used to be a single `number | null` shared by every
    // set (spec "헬스 운동 — 세트별 무게 지원") — existing localStorage rows
    // (and any cloud row pulled from an older client) may still have that
    // legacy scalar shape; upgraded in place the same way targetReps was.
    targetWeightKg: normalizePerSetArray(target.targetWeightKg, sets),
  };
}

function normalizeRoutine(routine: GymRoutine): GymRoutine {
  return { ...routine, days: routine.days.map((d) => ({ ...d, exercises: d.exercises.map(normalizeTarget) })) };
}

function readAll(): GymRoutine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as GymRoutine[]) : [];
    return parsed.map(normalizeRoutine);
  } catch {
    return [];
  }
}

function writeAll(routines: GymRoutine[]) {
  window.localStorage.setItem(KEY, JSON.stringify(routines));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const gymRoutineRepository = {
  list(): GymRoutine[] {
    return readAll();
  },
  get(id: string): GymRoutine | undefined {
    return readAll().find((r) => r.id === id);
  },
  save(routine: GymRoutine): void {
    const normalized = normalizeRoutine(routine);
    const all = readAll();
    const idx = all.findIndex((r) => r.id === normalized.id);
    if (idx >= 0) all[idx] = normalized;
    else all.unshift(normalized);
    writeAll(all);
  },
  delete(id: string): void {
    writeAll(readAll().filter((r) => r.id !== id));
    const deleted = readDeletedIds();
    deleted[id] = new Date().toISOString();
    writeDeletedIds(deleted);
  },
  /** Ids deleted locally that still need their Supabase row removed — see gymRoutineSync.ts. */
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
};
