// Provider-agnostic real web search — the ONLY source of "web_search" mode
// research candidates (aiCurriculum/types.ts's ResearchMode). Mirrors
// src/lib/ai/types.ts / src/lib/videoSearch/types.ts's two-transport shape
// (Electron IPC vs Supabase Edge Function) so this can be swapped for a
// different provider later without touching aiCurriculum code — nothing
// downstream of `webSearchProvider.search()` ever references "Tavily" by
// name.

export interface SearchResult {
  title: string;
  url: string;
  /** Short excerpt Tavily already extracts — always present when the provider returns one. */
  snippet?: string;
  /** Cleaned full-page text (Tavily's include_raw_content) — may be absent for a given result even on success. */
  content?: string;
  /** Hostname of `url`, for per-domain fairness checks — never fabricated (derived from the real URL, or omitted if unparseable). */
  source?: string;
  publishedAt?: string;
}

export type WebSearchErrorCode = 'NO_API_KEY' | 'INVALID_API_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'UNAUTHORIZED' | 'UNKNOWN';

export type WebSearchOutcome = { ok: true; results: SearchResult[] } | { ok: false; code: WebSearchErrorCode; message: string };

export interface WebSearchProvider {
  search(query: string): Promise<WebSearchOutcome>;
}
