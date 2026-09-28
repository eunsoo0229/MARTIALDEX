// Runs on a separate thread (Vite Worker entry, `type: 'module'`). Its only
// job is Fuse's fuzzy pass — the expensive part of search.ts's two-tier
// search (see searchCore.ts) — so it never has to block the main thread's
// rendering/input handling. Only ever sends/receives ids (not full
// Technique objects) since the main thread already holds the same corpus
// in memory and can resolve them locally; posting whole objects (with their
// long prose fields) across the thread boundary would just add its own
// serialization cost back.
import { fuse } from './searchCore';

export interface SearchWorkerRequest {
  id: number;
  query: string;
}

export interface SearchWorkerResponse {
  id: number;
  resultIds: string[];
}

self.onmessage = (e: MessageEvent<SearchWorkerRequest>) => {
  const { id, query } = e.data;
  const resultIds = fuse.search(query).map((r) => r.item.id);
  const response: SearchWorkerResponse = { id, resultIds };
  (self as unknown as Worker).postMessage(response);
};
