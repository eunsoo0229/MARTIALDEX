import type { PoseFrame } from '../poseAnalysis/types';
import { canonicalTechniqueId } from '../techniqueCanonical';
import type { ClipFrame, ClipSignals, FormCompareRecord, ReferenceVideo } from './types';

// Reference videos per technique + finished comparisons.
//   localStorage  martialdex:form-reference-videos   ReferenceVideo[] (text only: source, segment, criteria)
//                 martialdex:form-compare-records    FormCompareRecord[] (text only — no video, no frames)
//   IndexedDB     martialdex-form-compare / media     file references only: keyframes, poses and (≤ 40 MB)
//                                                     the file the user chose, for side-by-side playback
// The localStorage keys are covered by the existing cloud backup
// (cloudSync/dataBackup.ts backs up every martialdex:* key); the IndexedDB
// media stays on this device.

const REF_KEY = 'martialdex:form-reference-videos';
const REC_KEY = 'martialdex:form-compare-records';
export const FORM_COMPARE_EVENT = 'martialdex:form-compare-updated';
const MAX_RECORDS_PER_TECHNIQUE = 50;
export const MAX_STORED_FILE_BYTES = 40 * 1024 * 1024;

function read<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, list: T[]) {
  window.localStorage.setItem(key, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(FORM_COMPARE_EVENT));
}

export function listReferences(techniqueId?: string): ReferenceVideo[] {
  const all = read<ReferenceVideo>(REF_KEY);
  if (!techniqueId) return all;
  const k = canonicalTechniqueId(techniqueId);
  return all.filter((r) => canonicalTechniqueId(r.techniqueId) === k).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getReference(id: string): ReferenceVideo | null {
  return read<ReferenceVideo>(REF_KEY).find((r) => r.id === id) ?? null;
}

export function saveReference(ref: ReferenceVideo): ReferenceVideo {
  const all = read<ReferenceVideo>(REF_KEY).filter((r) => r.id !== ref.id);
  write(REF_KEY, [...all, ref]);
  return ref;
}

export async function deleteReference(id: string): Promise<void> {
  write(REF_KEY, read<ReferenceVideo>(REF_KEY).filter((r) => r.id !== id));
  await deleteMedia(id).catch(() => {});
}

export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rnd}`;
}

// ---------------------------------------------------------------- records

export function listCompareRecords(techniqueId?: string): FormCompareRecord[] {
  const all = read<FormCompareRecord>(REC_KEY);
  const list = techniqueId ? all.filter((r) => canonicalTechniqueId(r.techniqueId) === canonicalTechniqueId(techniqueId)) : all;
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function saveCompareRecord(rec: FormCompareRecord): void {
  const all = read<FormCompareRecord>(REC_KEY).filter((r) => r.id !== rec.id);
  const same = all.filter((r) => canonicalTechniqueId(r.techniqueId) === canonicalTechniqueId(rec.techniqueId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const drop = new Set(same.slice(0, Math.max(0, same.length + 1 - MAX_RECORDS_PER_TECHNIQUE)).map((r) => r.id));
  write(REC_KEY, [...all.filter((r) => !drop.has(r.id)), rec]);
}

// ---------------------------------------------------------------- IndexedDB media (file references)

export interface ReferenceMedia {
  id: string;
  frames: ClipFrame[];
  poses: PoseFrame[];
  signals: ClipSignals;
  file: Blob | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('martialdex-form-compare', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('media', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction('media', mode).objectStore('media'));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }).finally(() => db.close());
}

export function putMedia(m: ReferenceMedia): Promise<unknown> {
  return tx('readwrite', (s) => s.put(m));
}
export async function getMedia(id: string): Promise<ReferenceMedia | null> {
  return ((await tx('readonly', (s) => s.get(id))) as ReferenceMedia | undefined) ?? null;
}
export function deleteMedia(id: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(id));
}
