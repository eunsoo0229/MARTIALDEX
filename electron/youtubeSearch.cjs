// Keyless YouTube search — no API key exists anywhere in this app (see
// src/lib/youtube.ts). This fetches YouTube's own public search-results
// page (the same HTML any browser gets for youtube.com/results) and parses
// the `ytInitialData` JSON that page embeds for its own rendering, which is
// the standard no-key technique for reading YouTube search results (the
// same approach tools like yt-dlp use). Runs only in the Electron main
// process — never in the renderer bundle — both because a browser/webview
// fetch to youtube.com would be blocked by CORS (that response carries no
// Access-Control-Allow-Origin header) and to keep this scraping logic in
// one place, same isolation rationale as gemini.cjs.
//
// Only ever used as a FALLBACK when a technique has no curated video in
// data/curated/videos.json — never overwrites that file, and results are
// used for display only in the calling session (see
// src/lib/videoSearch/cache.ts for the local-only cache layer).

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESULTS = 3;
const SEARCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function findVideoRenderers(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.videoRenderer) out.push(node.videoRenderer);
  for (const key in node) {
    if (key === 'videoRenderer') continue;
    findVideoRenderers(node[key], out);
  }
}

async function searchYoutube(query) {
  if (typeof query !== 'string' || !query.trim()) {
    return { ok: false, code: 'UNKNOWN', message: '검색어가 비어 있습니다.' };
  }

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SEARCH_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, code: 'NETWORK', message: 'YouTube 검색 결과를 가져오지 못했습니다.' };
    }
    html = await res.text();
  } catch (err) {
    return {
      ok: false,
      code: 'NETWORK',
      message:
        err && err.name === 'AbortError'
          ? '검색 응답 시간이 너무 오래 걸려 중단했습니다.'
          : '네트워크 오류로 YouTube에 연결할 수 없습니다.',
    };
  } finally {
    clearTimeout(timeout);
  }

  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) {
    return { ok: false, code: 'EMPTY_RESPONSE', message: '검색 결과를 해석하지 못했습니다.' };
  }

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return { ok: false, code: 'EMPTY_RESPONSE', message: '검색 결과를 해석하지 못했습니다.' };
  }

  const renderers = [];
  findVideoRenderers(data, renderers);

  const results = renderers
    .filter((v) => v && v.videoId && v.title?.runs?.[0]?.text)
    .slice(0, MAX_RESULTS)
    .map((v) => ({
      videoId: v.videoId,
      title: v.title.runs[0].text,
      channel: v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '',
      // YouTube's standard, always-available thumbnail URL for any public
      // video id — simpler and more stable than the signed thumbnail URLs
      // embedded in the search page's own JSON.
      thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    }));

  return { ok: true, results };
}

module.exports = { searchYoutube };
