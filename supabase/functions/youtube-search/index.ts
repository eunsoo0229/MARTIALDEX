// Supabase Edge Function — the Android/Capacitor and plain-web transport for
// the keyless YouTube search fallback (mirrors gemini-ask/index.ts's shape
// exactly, see that file's header comment for the general rationale of
// "proxy from a server-side function, gated by the app's own login").
//
// No API key exists here at all — this fetches YouTube's own public
// search-results HTML and parses the `ytInitialData` JSON it embeds for its
// own client-side rendering (the standard no-key technique, same as
// electron/youtubeSearch.cjs; keep the two in sync). It still requires a
// logged-in user, same reason as gemini-ask: without that gate this would
// be an open, unauthenticated relay the moment its URL is known from a
// public APK, wasting this function's execution budget and risking
// YouTube rate-limiting/blocking this server's IP.

import { createClient } from 'npm:@supabase/supabase-js@2';

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESULTS = 3;
const SEARCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type VideoSearchErrorCode = 'NETWORK' | 'UNAUTHORIZED' | 'EMPTY_RESPONSE' | 'UNKNOWN';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResult(code: VideoSearchErrorCode, message: string) {
  return { ok: false, code, message };
}

function findVideoRenderers(node: any, out: any[]) {
  if (!node || typeof node !== 'object') return;
  if (node.videoRenderer) out.push(node.videoRenderer);
  for (const key in node) {
    if (key === 'videoRenderer') continue;
    findVideoRenderers(node[key], out);
  }
}

async function searchYoutube(query: string) {
  if (!query.trim()) {
    return errorResult('UNKNOWN', '검색어가 비어 있습니다.');
  }

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SEARCH_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return errorResult('NETWORK', 'YouTube 검색 결과를 가져오지 못했습니다.');
    }
    html = await res.text();
  } catch (err) {
    return errorResult(
      'NETWORK',
      err instanceof Error && err.name === 'AbortError'
        ? '검색 응답 시간이 너무 오래 걸려 중단했습니다.'
        : '네트워크 오류로 YouTube에 연결할 수 없습니다.',
    );
  } finally {
    clearTimeout(timeout);
  }

  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) {
    return errorResult('EMPTY_RESPONSE', '검색 결과를 해석하지 못했습니다.');
  }

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return errorResult('EMPTY_RESPONSE', '검색 결과를 해석하지 못했습니다.');
  }

  const renderers: any[] = [];
  findVideoRenderers(data, renderers);

  const results = renderers
    .filter((v) => v && v.videoId && v.title?.runs?.[0]?.text)
    .slice(0, MAX_RESULTS)
    .map((v) => ({
      videoId: v.videoId as string,
      title: v.title.runs[0].text as string,
      channel: (v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '') as string,
      thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    }));

  return { ok: true, results };
}

// Single-video metadata for the "YouTube URL 직접 추가" verification flow —
// keep in sync with electron/youtubeSearch.cjs's getVideoInfo. Tries the
// public watch page first, then YouTube's own public player endpoint (the
// watch page is often refused from datacenter IPs like this function's;
// the player endpoint still returns the real videoDetails there).
const PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const PLAYER_CLIENT = { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' };

function infoFromPlayerResponse(videoId: string, data: any) {
  const details = data?.videoDetails;
  const status = data?.playabilityStatus?.status as string | undefined;
  if (!details || details.videoId !== videoId) return null;
  const micro = data.microformat?.playerMicroformatRenderer ?? {};
  return {
    videoId,
    title: (details.title ?? '') as string,
    channel: (details.author ?? '') as string,
    description: ((details.shortDescription ?? '') as string).slice(0, 4000),
    lengthSeconds: Number(details.lengthSeconds) || 0,
    keywords: Array.isArray(details.keywords) ? (details.keywords as string[]).slice(0, 40) : [],
    category: (micro.category ?? null) as string | null,
    // The player endpoint reports streaming eligibility (e.g. UNPLAYABLE
    // without a browser session), not existence — only a hard ERROR means
    // the video is gone/private.
    playable: status !== 'ERROR',
  };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getVideoInfo(videoId: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return errorResult('UNKNOWN', '올바른 YouTube 영상 ID가 아닙니다.');
  }
  try {
    const res = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { 'User-Agent': SEARCH_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (res.ok) {
      const match = (await res.text()).match(/var ytInitialPlayerResponse = (\{.*?\});(?:var |<\/script>)/s);
      if (match) {
        const info = infoFromPlayerResponse(videoId, JSON.parse(match[1]));
        if (info) return { ok: true, info };
      }
    }
  } catch {
    // fall through to the player endpoint
  }
  try {
    const res = await fetchWithTimeout(PLAYER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': SEARCH_USER_AGENT },
      body: JSON.stringify({ videoId, context: { client: PLAYER_CLIENT } }),
    });
    if (res.ok) {
      const info = infoFromPlayerResponse(videoId, await res.json());
      if (info) return { ok: true, info };
    }
  } catch {
    // fall through to the search-results excerpt
  }
  // Last resort (servers are often refused both of the above): YouTube's own
  // search results for the id carry the real title/channel/length and the
  // first part of the description. Marked as an excerpt so the verifier
  // knows it is partial and can say "insufficient" honestly.
  try {
    const res = await fetchWithTimeout(`https://www.youtube.com/results?search_query=${encodeURIComponent(videoId)}`, {
      headers: { 'User-Agent': SEARCH_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) return errorResult('NETWORK', 'YouTube 영상 정보를 가져오지 못했습니다.');
    const match = (await res.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!match) return errorResult('EMPTY_RESPONSE', '영상 정보를 해석하지 못했습니다.');
    const renderers: any[] = [];
    findVideoRenderers(JSON.parse(match[1]), renderers);
    const v = renderers.find((r) => r?.videoId === videoId);
    if (!v) return errorResult('EMPTY_RESPONSE', '재생할 수 없거나 존재하지 않는 영상입니다.');
    const snippet = (v.detailedMetadataSnippets?.[0]?.snippetText?.runs ?? []).map((r: any) => r.text).join('');
    const [mm, ss] = String(v.lengthText?.simpleText ?? '').split(':').slice(-2).map(Number);
    return {
      ok: true,
      info: {
        videoId,
        title: (v.title?.runs?.[0]?.text ?? '') as string,
        channel: (v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '') as string,
        description: snippet.replace(/\.\.\.$/, '').trim(),
        lengthSeconds: Number.isFinite(mm) && Number.isFinite(ss) ? mm * 60 + ss : 0,
        keywords: [],
        category: null,
        playable: true,
        descriptionIsExcerpt: true,
      },
    };
  } catch (err) {
    return errorResult('NETWORK', err instanceof Error && err.name === 'AbortError' ? '응답 시간이 너무 오래 걸려 중단했습니다.' : '네트워크 오류로 YouTube에 연결할 수 없습니다.');
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(errorResult('UNKNOWN', 'POST 요청만 허용됩니다.'), 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return jsonResponse(errorResult('UNAUTHORIZED', '영상 검색을 사용하려면 로그인이 필요합니다.'), 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(errorResult('UNKNOWN', '서버 설정 오류입니다. 관리자에게 문의해주세요.'), 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse(errorResult('UNAUTHORIZED', '로그인 세션이 유효하지 않습니다. 다시 로그인해주세요.'), 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(errorResult('UNKNOWN', '요청 형식이 올바르지 않습니다.'), 400);
  }

  const videoId = (body as { videoId?: unknown })?.videoId;
  if (typeof videoId === 'string') {
    return jsonResponse(await getVideoInfo(videoId.trim()));
  }

  const query = (body as { query?: unknown })?.query;
  if (typeof query !== 'string' || !query.trim()) {
    return jsonResponse(errorResult('UNKNOWN', '검색어가 비어 있습니다.'), 400);
  }

  const result = await searchYoutube(query);
  return jsonResponse(result);
});
