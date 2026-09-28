import { supabase } from '../supabase/client';
import type { WebSearchOutcome } from './types';

// Same two-transport shape as src/lib/ai/provider.ts and
// src/lib/videoSearch/provider.ts:
// 1. Electron (window.martialdex.webSearch present): IPC to
//    electron/main.cjs -> electron/webSearch.cjs, which reads
//    TAVILY_API_KEY from the main process's own environment.
// 2. Everywhere else (Android/Capacitor, plain web): calls the
//    `web-search` Supabase Edge Function. Requires login, same rationale
//    as gemini-ask/youtube-search.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function searchViaElectron(query: string): Promise<WebSearchOutcome> {
  try {
    return await window.martialdex!.webSearch(query);
  } catch {
    return { ok: false, code: 'NETWORK', message: '검색 요청 중 오류가 발생했습니다.' };
  }
}

async function searchViaSupabaseEdgeFunction(query: string): Promise<WebSearchOutcome> {
  if (!supabase || !SUPABASE_URL) {
    return { ok: false, code: 'UNKNOWN', message: '외부 검색 기능이 아직 설정되지 않았습니다.' };
  }
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return { ok: false, code: 'UNAUTHORIZED', message: '외부 검색을 사용하려면 먼저 로그인해주세요.' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/web-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ query }),
    });
    return (await res.json()) as WebSearchOutcome;
  } catch {
    return { ok: false, code: 'NETWORK', message: '네트워크 오류로 검색할 수 없습니다.' };
  }
}

// Confirms which transport this specific runtime actually picked (Electron
// IPC available vs falling through to the Supabase Edge Function) and how
// the call ultimately resolved from the RENDERER's point of view — same
// [CURRICULUM_TAVILY_RUNTIME] tag electron/webSearch.cjs and the
// web-search Edge Function use for their own deeper request/response trace
// (see their doc comments for why this is never gated to dev-only builds:
// this project's only distribution is the "test build" described in
// electron-builder.config.cjs, and the bug this exists to catch only
// reproduces in a packaged build). Never logs the API key — this layer
// never even has access to it.
export const webSearchProvider = {
  async search(query: string): Promise<WebSearchOutcome> {
    const transport = window.martialdex?.webSearch ? 'electron' : 'supabase_edge';
    console.debug(`[CURRICULUM_TAVILY_RUNTIME] phase=transport_select transport=${transport}`);
    const outcome = transport === 'electron' ? await searchViaElectron(query) : await searchViaSupabaseEdgeFunction(query);
    console.debug(
      `[CURRICULUM_TAVILY_RUNTIME] phase=renderer_result transport=${transport} status=${outcome.ok ? 'SUCCESS' : 'FAILED'}${
        outcome.ok ? ` resultCount=${outcome.results.length}` : ` errorCode=${outcome.code}`
      }`
    );
    return outcome;
  },
};
