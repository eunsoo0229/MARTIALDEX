import { supabase } from '../supabase/client';
import type { VideoSearchOutcome } from './types';

// Same two-transport shape as src/lib/ai/provider.ts:
// 1. Electron (window.martialdex.searchYoutube present): IPC to
//    electron/main.cjs -> electron/youtubeSearch.cjs, which fetches
//    youtube.com's own search-results page from the main process (no CORS
//    restriction there, no API key involved — see that file's header
//    comment). Not touched by this file.
// 2. Everywhere else (Android/Capacitor, plain web): calls the
//    `youtube-search` Supabase Edge Function, which does the same fetch
//    server-side. Requires the user to be logged in, same rationale as
//    gemini-ask: keeps this from becoming an open, unauthenticated relay
//    once the URL is known from the APK.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function searchViaElectron(query: string): Promise<VideoSearchOutcome> {
  try {
    return await window.martialdex!.searchYoutube(query);
  } catch {
    return { ok: false, code: 'NETWORK', message: '영상 검색 중 오류가 발생했습니다.' };
  }
}

async function searchViaSupabaseEdgeFunction(query: string): Promise<VideoSearchOutcome> {
  if (!supabase || !SUPABASE_URL) {
    return { ok: false, code: 'UNKNOWN', message: '영상 검색 기능이 아직 설정되지 않았습니다.' };
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return { ok: false, code: 'UNAUTHORIZED', message: '영상 검색을 사용하려면 먼저 로그인해주세요.' };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/youtube-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query }),
    });
    return (await res.json()) as VideoSearchOutcome;
  } catch {
    return { ok: false, code: 'NETWORK', message: '네트워크 오류로 영상을 검색할 수 없습니다.' };
  }
}

export const videoSearchProvider = {
  async search(query: string): Promise<VideoSearchOutcome> {
    if (window.martialdex?.searchYoutube) return searchViaElectron(query);
    return searchViaSupabaseEdgeFunction(query);
  },
};
