import type { SparringSessionRecord } from './types';

// Same martialdex:-prefixed localStorage + CustomEvent pattern as every
// other local-first module (combo/repository.ts, curriculum/repository.ts,
// etc.) — works offline/logged-out, gets the dedicated Supabase table sync
// in cloudSync/sparringSessionSync.ts on top of that.
//
// Own key: this used to share 'martialdex:sparring-sessions' with the
// sparring VIDEO ANALYSIS store (sparringAnalysis/repository.ts), so each
// feature read the other's records (an analysis record has no `equipment`,
// which crashed the sparring setup screen). Rule records found under the old
// shared key are moved here once — nothing is deleted.
const KEY = 'martialdex:sparring-rule-sessions';
const LEGACY_SHARED_KEY = 'martialdex:sparring-sessions';
const EVENT = 'martialdex:sparring-rule-sessions-updated';

/** A rule-based sparring record (not a video-analysis one). */
export function isSparringRuleRecord(x: unknown): x is SparringSessionRecord {
  const r = x as Partial<SparringSessionRecord> | null;
  return !!r && typeof r.id === 'string' && Array.isArray(r.equipment) && typeof r.roundDurationSeconds === 'number' && typeof r.plannedRounds === 'number';
}

function parse(raw: string | null): unknown[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function migrateFromSharedKey() {
  try {
    if (window.localStorage.getItem(KEY) !== null) return;
    const shared = parse(window.localStorage.getItem(LEGACY_SHARED_KEY));
    const rules = shared.filter(isSparringRuleRecord);
    // write the new key first, then drop the moved records from the shared one
    window.localStorage.setItem(KEY, JSON.stringify(rules));
    if (rules.length > 0) {
      window.localStorage.setItem(LEGACY_SHARED_KEY, JSON.stringify(shared.filter((x) => !isSparringRuleRecord(x))));
      // may run during a render — notify other screens after it, not inside it
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('martialdex:sparring-sessions-updated')), 0);
    }
  } catch {
    // storage unavailable — readAll() falls back to an empty list
  }
}

function readAll(): SparringSessionRecord[] {
  migrateFromSharedKey();
  return parse(window.localStorage.getItem(KEY)).filter(isSparringRuleRecord);
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
