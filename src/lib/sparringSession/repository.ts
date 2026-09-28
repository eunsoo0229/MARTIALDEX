import type { SparringSessionRecord } from './types';

// Same martialdex:-prefixed localStorage + CustomEvent pattern as every
// other local-first module (combo/repository.ts, curriculum/repository.ts,
// etc.) — works offline/logged-out, gets the dedicated Supabase table sync
// in cloudSync/sparringSessionSync.ts on top of that.
const KEY = 'martialdex:sparring-sessions';
const EVENT = 'martialdex:sparring-sessions-updated';

function readAll(): SparringSessionRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SparringSessionRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(sessions: SparringSessionRecord[]) {
  window.localStorage.setItem(KEY, JSON.stringify(sessions));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const sparringSessionRepository = {
  list(): SparringSessionRecord[] {
    // Newest first — used directly by "지난 룰 불러오기" (most recent = index 0).
    return readAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  get(id: string): SparringSessionRecord | undefined {
    return readAll().find((s) => s.id === id);
  },
  save(session: SparringSessionRecord): void {
    const all = readAll();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx >= 0) all[idx] = session;
    else all.unshift(session);
    writeAll(all);
  },
  delete(id: string): void {
    writeAll(readAll().filter((s) => s.id !== id));
  },
};

export const SPARRING_SESSIONS_EVENT = EVENT;
