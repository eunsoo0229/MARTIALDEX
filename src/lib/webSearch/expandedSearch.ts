import { webSearchProvider } from './provider';
import type { SearchResult } from './types';

const DEBUG = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
function structuredLog(tag: string, fields: Record<string, string | number | boolean>) {
  if (!DEBUG) return;
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : v}`);
  console.debug(`[${tag}] ${parts.join(' ')}`);
}

/**
 * Generic, reusable multi-wave real Tavily search — the SAME
 * webSearchProvider/transport (electron IPC vs Supabase Edge Function) the
 * rest of the app already uses (aiCurriculum/techniqueResearch.ts's
 * attemptWebSearchWithExpansion), extracted here so a second feature (new
 * martial art / missing technique verification) can reuse the exact same
 * "real HTTP call, cross-wave URL dedup, never fabricate a result" search
 * layer instead of re-implementing it. This module never calls Tavily
 * directly and never sees an API key — that stays inside
 * electron/webSearch.cjs / supabase/functions/web-search, unchanged.
 */
export async function runSearchWave(
  queries: string[],
  seenUrls: Set<string>
): Promise<{ collected: SearchResult[]; executedQueries: string[]; attemptedAny: boolean; anySuccess: boolean; notConfigured: boolean; lastError: string | null }> {
  const collected: SearchResult[] = [];
  const executedQueries: string[] = [];
  let attemptedAny = false;
  let anySuccess = false;
  let notConfigured = false;
  let lastError: string | null = null;

  for (const q of queries) {
    const outcome = await webSearchProvider.search(q);
    attemptedAny = true;
    if (!outcome.ok) {
      structuredLog('CURRICULUM_TAVILY_RUNTIME', { phase: 'expanded_search', query: q, status: 'FAILED', errorCode: outcome.code });
      if (outcome.code === 'NO_API_KEY') {
        notConfigured = true;
        break;
      }
      lastError = outcome.message;
      continue;
    }
    anySuccess = true;
    structuredLog('CURRICULUM_TAVILY_RUNTIME', { phase: 'expanded_search', query: q, status: 'SUCCESS', resultCount: outcome.results.length });
    executedQueries.push(q);
    for (const r of outcome.results) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      collected.push(r);
    }
  }
  return { collected, executedQueries, attemptedAny, anySuccess, notConfigured, lastError };
}

export interface ExpandedWebResearchOutcome {
  ok: boolean;
  collected: SearchResult[];
  executedQueries: string[];
  wavesRun: number;
  /** True only when Tavily was never even attempted (no API key configured) — distinct from a real attempt that found nothing (see anySuccess). */
  notConfigured: boolean;
  /** True once at least one real HTTP call to Tavily succeeded (regardless of result count) — false means every call failed at the transport/auth level. */
  anySuccess: boolean;
  errorMessage?: string;
}

/**
 * Runs each wave of queries in order (bounded by however many waves the
 * caller passes — never open-ended), merging results with cross-wave URL
 * dedup, and stops early once Tavily is confirmed unavailable (no API key).
 * Mirrors techniqueResearch.ts's attemptWebSearchWithExpansion's wave-loop
 * shape but is deliberately generic (no GoalAnalysis coupling) so a
 * completely different feature (martial art / technique verification) can
 * drive its own query strategy while still going through the exact same
 * real search layer.
 */
export async function runExpandedWebResearch(queryWaves: string[][]): Promise<ExpandedWebResearchOutcome> {
  const seenUrls = new Set<string>();
  const collected: SearchResult[] = [];
  const executedQueries: string[] = [];
  let anyAttempted = false;
  let anySuccess = false;
  let notConfigured = false;
  let lastError: string | null = null;
  let wavesRun = 0;

  for (const wave of queryWaves) {
    const queries = wave.filter((q) => !executedQueries.includes(q));
    if (queries.length === 0) continue;
    const result = await runSearchWave(queries, seenUrls);
    anyAttempted = anyAttempted || result.attemptedAny;
    anySuccess = anySuccess || result.anySuccess;
    if (result.lastError) lastError = result.lastError;
    if (result.notConfigured) {
      notConfigured = true;
      break;
    }
    executedQueries.push(...result.executedQueries);
    collected.push(...result.collected);
    wavesRun++;
  }

  if (!anyAttempted || notConfigured) {
    return { ok: false, collected: [], executedQueries: [], wavesRun: 0, notConfigured: true, anySuccess: false };
  }
  if (!anySuccess) {
    return { ok: false, collected, executedQueries, wavesRun, notConfigured: false, anySuccess: false, errorMessage: lastError ?? '검색 결과가 없습니다.' };
  }
  return { ok: true, collected, executedQueries, wavesRun, notConfigured: false, anySuccess: true };
}
