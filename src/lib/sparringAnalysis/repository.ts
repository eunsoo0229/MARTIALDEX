import type { SparringSession } from './types';

// Only the small structured analysis result is ever persisted here — the
// uploaded video File/blob itself is never written to localStorage or sent
// anywhere (see SparringAnalysis.tsx: the object URL is revoked once the
// wizard leaves the video-preview/analysis steps). This is a brand new store
// because nothing like a general sparring-session log existed before (see
// README "실제 스파링 영상 기반 AI 분석" for why it isn't folded into
// trainingHistory or poseAnalysis's stores).
const KEY = 'martialdex:sparring-sessions';

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

export const sparringSessionRepository = {
  list(): SparringSession[] {
    // Rule-based sparring records once shared this key (see
    // sparringSession/repository.ts) — never treat one as an analysis result.
    const all = readJson<unknown>(KEY, []);
    return (Array.isArray(all) ? all : []).filter((s): s is SparringSession => !!s && typeof s === 'object' && !('roundDurationSeconds' in s && 'equipment' in s));
  },
  get(id: string): SparringSession | undefined {
    return this.list().find((s) => s.id === id);
  },
  save(session: SparringSession): void {
    const list = this.list();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) list[idx] = session;
    else list.unshift(session);
    writeJson(KEY, list);
    window.dispatchEvent(new CustomEvent('martialdex:sparring-sessions-updated'));
  },
  delete(id: string): void {
    writeJson(
      KEY,
      this.list().filter((s) => s.id !== id)
    );
    window.dispatchEvent(new CustomEvent('martialdex:sparring-sessions-updated'));
  },
};
