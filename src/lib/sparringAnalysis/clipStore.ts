// 약점 클립 저장소 — the cut clips' media (Blob) in IndexedDB, keyed by
// session + clip id. Metadata (times, status, errors) lives on the session
// record (SparringClip); only the bytes live here, so the localStorage-based
// session repository never holds video data. Per-device only (no cloud
// upload of sparring footage).

const DB_NAME = 'martialdex-sparring-clips';
const STORE = 'clips';

export interface StoredClip {
  key: string;
  sessionId: string;
  clipId: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('sessionId', 'sessionId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export const clipKey = (sessionId: string, clipId: string) => `${sessionId}::${clipId}`;

export function saveClip(sessionId: string, clipId: string, blob: Blob): Promise<IDBValidKey> {
  const record: StoredClip = { key: clipKey(sessionId, clipId), sessionId, clipId, blob, mimeType: blob.type, createdAt: new Date().toISOString() };
  return tx('readwrite', (s) => s.put(record));
}

export async function getClip(sessionId: string, clipId: string): Promise<StoredClip | null> {
  try {
    return ((await tx('readonly', (s) => s.get(clipKey(sessionId, clipId)))) as StoredClip | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteClip(sessionId: string, clipId: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(clipKey(sessionId, clipId)));
  } catch {
    // nothing stored
  }
}

/** Removes every clip of a session (used when the session itself is deleted). */
export async function deleteClipsForSession(sessionId: string): Promise<void> {
  try {
    const keys = (await tx('readonly', (s) => s.index('sessionId').getAllKeys(sessionId))) as IDBValidKey[];
    for (const k of keys) await tx('readwrite', (s) => s.delete(k));
  } catch {
    // nothing stored
  }
}
