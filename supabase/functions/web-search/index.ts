// Supabase Edge Function — the Android/Capacitor and plain-web transport for
// real external web search. Mirrors gemini-ask/index.ts's shape exactly:
// runs server-side on Supabase's Deno runtime, TAVILY_API_KEY lives only in
// this function's environment (set via `supabase secrets set
// TAVILY_API_KEY=...`), never in any client bundle, .apk, or repo file.
// Requires a valid Supabase-issued JWT, same rationale as gemini-ask —
// without that gate this becomes a free, unauthenticated relay the moment
// its URL is known from a public APK, burning this project's Tavily quota.

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RESULTS = 8;
const MAX_CONTENT_CHARS = 4000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type WebSearchErrorCode = 'NO_API_KEY' | 'INVALID_API_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'UNAUTHORIZED' | 'UNKNOWN';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

function errorResult(code: WebSearchErrorCode, message: string) {
  return { ok: false, code, message };
}

// Same runtime-diagnostic tag as electron/webSearch.cjs (see that file's
// doc comment) — visible via `supabase functions logs web-search`. Never
// logs the API key value/length, only whether it was present.
function runtimeLog(fields: Record<string, string | number | boolean>) {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`);
  console.log(`[CURRICULUM_TAVILY_RUNTIME] ${parts.join(' ')}`);
}

async function webSearch(query: string) {
  const apiKey = Deno.env.get('TAVILY_API_KEY');
  if (!apiKey) {
    runtimeLog({ status: 'FAILED', transport: 'supabase_edge', errorType: 'ENV_MISSING', httpStatus: 'none', errorMessage: 'TAVILY_API_KEY is unavailable', queryCount: 1 });
    return errorResult('NO_API_KEY', 'Tavily API 키가 서버에 설정되지 않았습니다.');
  }

  runtimeLog({ phase: 'request', transport: 'supabase_edge', queryCount: 1, hasApiKey: true });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: MAX_RESULTS, include_raw_content: 'text' }),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    runtimeLog({ status: 'FAILED', transport: 'supabase_edge', errorType: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR', httpStatus: 'none', errorMessage: JSON.stringify(String(err)), queryCount: 1 });
    return errorResult('NETWORK', isTimeout ? '검색 응답 시간이 너무 오래 걸려 요청을 중단했습니다.' : '네트워크 오류로 검색 서버에 연결할 수 없습니다.');
  } finally {
    clearTimeout(timeout);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errorType = res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : res.status === 429 || res.status === 432 ? 'RATE_LIMIT' : res.status >= 500 ? 'SERVER_ERROR' : 'BAD_RESPONSE';
    runtimeLog({ status: 'FAILED', transport: 'supabase_edge', errorType, httpStatus: res.status, errorMessage: JSON.stringify(json?.error ?? '(no body)'), queryCount: 1 });
    if (res.status === 401 || res.status === 403) return errorResult('INVALID_API_KEY', 'Tavily API 키가 올바르지 않거나 권한이 없습니다.');
    // 432 = Tavily plan/credit usage limit exceeded.
    if (res.status === 429 || res.status === 432) return errorResult('RATE_LIMIT', res.status === 432 ? 'Tavily 검색 사용량(요금제 한도)을 모두 사용했습니다.' : 'Tavily 검색 사용량 한도에 도달했습니다.');
    return errorResult('UNKNOWN', json?.error ? `검색 요청이 실패했습니다: ${json.error}` : '검색 요청이 실패했습니다.');
  }

  const rawResults = Array.isArray(json?.results) ? json.results : [];
  const seenUrls = new Set<string>();
  const results = [];
  for (const r of rawResults) {
    if (!r || typeof r.url !== 'string' || !r.url.trim() || typeof r.title !== 'string') continue;
    if (seenUrls.has(r.url)) continue;
    seenUrls.add(r.url);
    let source: string | undefined;
    try {
      source = new URL(r.url).hostname;
    } catch {
      source = undefined;
    }
    results.push({
      title: r.title,
      url: r.url,
      snippet: typeof r.content === 'string' ? r.content.slice(0, MAX_CONTENT_CHARS) : undefined,
      content: typeof r.raw_content === 'string' ? r.raw_content.slice(0, MAX_CONTENT_CHARS) : undefined,
      publishedAt: typeof r.published_date === 'string' ? r.published_date : undefined,
      source,
    });
  }

  runtimeLog({ status: 'SUCCESS', transport: 'supabase_edge', httpStatus: res.status, resultCount: results.length, queryCount: 1 });
  return { ok: true, results };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse(errorResult('UNKNOWN', 'POST 요청만 허용됩니다.'), 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse(errorResult('UNAUTHORIZED', '로그인이 필요합니다.'), 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return jsonResponse(errorResult('UNKNOWN', '서버 설정 오류입니다.'), 500);

  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return jsonResponse(errorResult('UNAUTHORIZED', '로그인 세션이 유효하지 않습니다.'), 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(errorResult('UNKNOWN', '요청 형식이 올바르지 않습니다.'), 400);
  }
  const query = (body as { query?: unknown })?.query;
  if (typeof query !== 'string' || !query.trim()) return jsonResponse(errorResult('UNKNOWN', '검색어가 비어 있습니다.'), 400);

  const result = await webSearch(query);
  return jsonResponse(result);
});
