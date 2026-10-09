import { supabase } from '../supabase/client';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { VideoInfoOutcome, VideoSearchOutcome } from './types';
import { infoFromPlayerResponse, infoFromWatchHtml, PLAYER_CLIENT, PLAYER_ENDPOINT } from './videoInfoParse';

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

async function videoInfoViaSupabaseEdgeFunction(videoId: string): Promise<VideoInfoOutcome> {
  if (!supabase || !SUPABASE_URL) {
    return { ok: false, code: 'UNKNOWN', message: '영상 정보 기능이 아직 설정되지 않았습니다.' };
  }
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return { ok: false, code: 'UNAUTHORIZED', message: '영상 확인을 사용하려면 먼저 로그인해주세요.' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/youtube-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ videoId }),
    });
    return (await res.json()) as VideoInfoOutcome;
  } catch {
    return { ok: false, code: 'NETWORK', message: '네트워크 오류로 영상 정보를 가져올 수 없습니다.' };
  }
}

/**
 * Android: fetch ON the device (the phone's own network) through Capacitor's
 * native HTTP — no CORS, and not subject to the datacenter-IP refusals that
 * make the Supabase function unable to read watch pages. Same two sources as
 * Electron: watch page, then YouTube's public player endpoint.
 */
async function videoInfoViaNativeHttp(videoId: string): Promise<VideoInfoOutcome> {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' };
  try {
    const page = await CapacitorHttp.get({ url: `https://www.youtube.com/watch?v=${videoId}&hl=en`, headers, responseType: 'text' });
    if (page.status === 200 && typeof page.data === 'string') {
      const info = infoFromWatchHtml(videoId, page.data);
      if (info) return { ok: true, info };
    }
    const player = await CapacitorHttp.post({
      url: PLAYER_ENDPOINT,
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { videoId, context: { client: PLAYER_CLIENT } },
    });
    const data = typeof player.data === 'string' ? JSON.parse(player.data) : player.data;
    const info = player.status === 200 ? infoFromPlayerResponse(videoId, data) : null;
    if (!info) return { ok: false, code: 'EMPTY_RESPONSE', message: '재생할 수 없거나 존재하지 않는 영상입니다.' };
    return { ok: true, info };
  } catch {
    return { ok: false, code: 'NETWORK', message: '네트워크 오류로 영상 정보를 가져올 수 없습니다.' };
  }
}

export const videoInfoProvider = {
  async get(videoId: string): Promise<VideoInfoOutcome> {
    if (!window.martialdex?.getYoutubeVideoInfo && Capacitor.isNativePlatform()) return videoInfoViaNativeHttp(videoId);
    if (window.martialdex?.getYoutubeVideoInfo) {
      try {
        return await window.martialdex.getYoutubeVideoInfo(videoId);
      } catch {
        return { ok: false, code: 'NETWORK', message: '영상 정보를 가져오는 중 오류가 발생했습니다.' };
      }
    }
    return videoInfoViaSupabaseEdgeFunction(videoId);
  },
};

export const videoSearchProvider = {
  async search(query: string): Promise<VideoSearchOutcome> {
    if (window.martialdex?.searchYoutube) return searchViaElectron(query);
    return searchViaSupabaseEdgeFunction(query);
  },
};
