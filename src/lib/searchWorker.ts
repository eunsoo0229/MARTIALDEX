import type { SearchWorkerRequest, SearchWorkerResponse } from './searchWorker.worker';

// Warmed up as soon as this module loads (search.ts is imported by
// SearchBar.tsx, which Header.tsx always mounts, so this happens within the
// first moment of any app screen — well before a user can type anything)
// rather than on first actual search need. The worker's own one-time
// startup (spinning up the thread, loading its module, building its own
// Fuse index) measured 150-700ms depending on hardware — cheap as a
// background side effect at boot, but expensive if it lands ON a user's
// first keystroke instead. Only the WORK a real search dispatches to it
// stays on-demand; only the thread itself is pre-created.
let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, { resolve: (ids: string[]) => void; reject: (err: unknown) => void; timer: number }>();

function getOrCreateWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./searchWorker.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
    const entry = pending.get(e.data.id);
    if (!entry) return; // already timed out / superseded
    pending.delete(e.data.id);
    window.clearTimeout(entry.timer);
    entry.resolve(e.data.resultIds);
  };
  worker.onerror = (e) => {
    // A worker-level error (e.g. failed to load the module) fails every
    // still-pending request so each caller's own try/catch can fall back
    // to the synchronous path instead of hanging forever.
    for (const [id, entry] of pending) {
      window.clearTimeout(entry.timer);
      entry.reject(e);
      pending.delete(id);
    }
  };
  return worker;
}

// Fire-and-forget warm-up — module-load-time side effect, safe in a Vite
// worker module (no-op during SSR/non-browser contexts, which this app
// doesn't have anyway).
// Phones: the worker loads its own copy of the technique data (~2.7 MB) — starting it at boot
// competed with the main bundle's parse on slow CPUs. Warm it once the app is idle instead
// (still long before most first searches; a search before then simply creates it on demand).
if (typeof window !== 'undefined') {
  const warm = () => getOrCreateWorker();
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(warm, { timeout: 6000 });
  else window.setTimeout(warm, 3000);
}

export function getSearchWorker(): { search(query: string): Promise<string[]> } {
  return {
    search(query: string) {
      return new Promise<string[]>((resolve, reject) => {
        const w = getOrCreateWorker();
        const id = nextRequestId++;
        // Defensive timeout — a real Fuse pass over this corpus is well
        // under a second even on slow hardware (measured), so 3s is
        // generous headroom; if it's ever exceeded (a worker stuck loading
        // its own chunk, e.g. on a very first cold cache), fall back rather
        // than leave the search UI stuck forever.
        const timer = window.setTimeout(() => {
          pending.delete(id);
          reject(new Error('search worker timeout'));
        }, 3000);
        pending.set(id, { resolve, reject, timer });
        const request: SearchWorkerRequest = { id, query };
        w.postMessage(request);
      });
    },
  };
}
