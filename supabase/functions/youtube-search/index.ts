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

  const query = (body as { query?: unknown })?.query;
  if (typeof query !== 'string' || !query.trim()) {
    return jsonResponse(errorResult('UNKNOWN', '검색어가 비어 있습니다.'), 400);
  }

  const result = await searchYoutube(query);
  return jsonResponse(result);
});
