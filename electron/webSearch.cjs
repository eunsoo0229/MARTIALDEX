// Real external web search — the ONLY place this app knows about Tavily.
// Runs in the Electron main process (Node), never in the renderer bundle,
// same isolation rationale as gemini.cjs: the API key read from
// process.env never ships to the frontend.
//
// Uses Tavily's REST Search API (https://api.tavily.com/search) — a real
// third-party search index reached over its documented HTTP API, not HTML
// scraping. Tavily's response already includes a cleaned text snippet (and,
// with include_raw_content, cleaned full-page text) per result, so no
// separate HTML-fetch/strip-script/truncate layer is needed here; this
// module only adds its OWN defensive caps (timeout, content length,
// duplicate-URL removal) in case Tavily ever returns something oversized.
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RESULTS = 8;
const MAX_CONTENT_CHARS = 4000; // per-result cap, defends against an unexpectedly huge raw_content payload

// Runtime diagnostic — traces the ACTUAL Tavily HTTP call this process
// makes (env-var availability, transport, real failure classification)
// instead of letting every failure reason collapse into the single
// downstream `knowledge_fallback` label. Never logs the API key value,
// length, or any substring of it — only whether it was present.
//
// Deliberately NOT gated on app.isPackaged/dev-only: this project's only
// distribution mechanism is the "test build" described in
// electron-builder.config.cjs (there is no separate consumer-release
// channel), and the exact bug this diagnostic exists to catch — Tavily
// silently falling back to knowledge_fallback — only reproduces in a
// packaged build (a stale per-machine userData `.env` missing the newer
// TAVILY_API_KEY line; project-root `.env` used in dev already had it). A
// dev-only gate here would make the diagnostic blind exactly where it's
// needed. This only ever writes to the Electron MAIN process's own stdout
// (visible in a terminal that launched the app, or via `console.debug` in
// an attached debugger) — never to the renderer, a file, or any network
// call — so it carries the same exposure as any other server-side log.
function runtimeLog(fields) {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`);
  console.debug(`[CURRICULUM_TAVILY_RUNTIME] ${parts.join(' ')}`);
}

async function webSearch(query) {
  if (typeof query !== 'string' || !query.trim()) {
    return { ok: false, code: 'UNKNOWN', message: '검색어가 비어 있습니다.' };
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    // envPath (a file path, never the key itself) — the exact .env file
    // main.cjs's resolveEnvPath() actually loaded, so a missing key is
    // immediately actionable ("add TAVILY_API_KEY= to THIS file") instead of
    // a guess between the project root, userData, or next-to-the-app.
    runtimeLog({
      status: 'FAILED',
      transport: 'electron',
      errorType: 'ENV_MISSING',
      httpStatus: 'none',
      errorMessage: 'TAVILY_API_KEY is unavailable',
      queryCount: 1,
      envPath: JSON.stringify(process.env.MARTIALDEX_ENV_PATH ?? '(unknown)'),
    });
    return { ok: false, code: 'NO_API_KEY', message: 'Tavily API 키가 설정되지 않았습니다.' };
  }

  runtimeLog({ phase: 'request', transport: 'electron', queryCount: 1, hasApiKey: true });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: query.trim(),
        search_depth: 'basic',
        max_results: MAX_RESULTS,
        include_raw_content: 'text',
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err && err.name === 'AbortError';
    runtimeLog({
      status: 'FAILED',
      transport: 'electron',
      errorType: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      httpStatus: 'none',
      errorMessage: JSON.stringify(String(err && err.message ? err.message : err)),
      queryCount: 1,
    });
    return {
      ok: false,
      code: 'NETWORK',
      message: isTimeout ? '검색 응답 시간이 너무 오래 걸려 요청을 중단했습니다.' : '네트워크 오류로 검색 서버에 연결할 수 없습니다.',
    };
  } finally {
    clearTimeout(timeout);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    // Never logs the Authorization header or the key itself — only Tavily's
    // own JSON error body (which never echoes the key back).
    const errorType = res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : res.status === 429 ? 'RATE_LIMIT' : res.status >= 500 ? 'SERVER_ERROR' : 'BAD_RESPONSE';
    runtimeLog({ status: 'FAILED', transport: 'electron', errorType, httpStatus: res.status, errorMessage: JSON.stringify(json?.error ?? '(no body)'), queryCount: 1 });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: 'INVALID_API_KEY', message: 'Tavily API 키가 올바르지 않거나 권한이 없습니다.' };
    }
    if (res.status === 429) {
      return { ok: false, code: 'RATE_LIMIT', message: 'Tavily 검색 사용량 한도에 도달했습니다.' };
    }
    return { ok: false, code: 'UNKNOWN', message: json?.error ? `검색 요청이 실패했습니다: ${json.error}` : '검색 요청이 실패했습니다.' };
  }

  const rawResults = Array.isArray(json?.results) ? json.results : [];
  const seenUrls = new Set();
  const results = [];
  for (const r of rawResults) {
    if (!r || typeof r.url !== 'string' || !r.url.trim() || typeof r.title !== 'string') continue;
    if (seenUrls.has(r.url)) continue; // dedup — Tavily itself already dedupes, but never trust a single source for this
    seenUrls.add(r.url);
    results.push({
      title: r.title,
      url: r.url,
      snippet: typeof r.content === 'string' ? r.content.slice(0, MAX_CONTENT_CHARS) : undefined,
      content: typeof r.raw_content === 'string' ? r.raw_content.slice(0, MAX_CONTENT_CHARS) : undefined,
      publishedAt: typeof r.published_date === 'string' ? r.published_date : undefined,
      source: (() => {
        try {
          return new URL(r.url).hostname;
        } catch {
          return undefined;
        }
      })(),
    });
  }

  runtimeLog({ status: 'SUCCESS', transport: 'electron', httpStatus: res.status, resultCount: results.length, queryCount: 1 });
  return { ok: true, results };
}

module.exports = { webSearch };
