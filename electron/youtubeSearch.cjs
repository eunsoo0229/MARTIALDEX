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

// Single-video metadata for the "YouTube URL 직접 추가" verification flow.
// Keep in sync with supabase/functions/youtube-search/index.ts. Returns ONLY
// what YouTube itself reports (title, channel, description, duration,
// keywords, category) — the verifier must never be handed invented metadata.
// Tries the public watch page first, then YouTube's own public player
// endpoint (same data; the watch page is sometimes refused).
const PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const PLAYER_CLIENT = { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' };

function infoFromPlayerResponse(videoId, data) {
  const details = data && data.videoDetails;
  const status = data && data.playabilityStatus && data.playabilityStatus.status;
  if (!details || details.videoId !== videoId) return null;
  const micro = (data.microformat && data.microformat.playerMicroformatRenderer) || {};
  return {
    videoId,
    title: details.title || '',
    channel: details.author || '',
    description: (details.shortDescription || '').slice(0, 4000),
    lengthSeconds: Number(details.lengthSeconds) || 0,
    keywords: Array.isArray(details.keywords) ? details.keywords.slice(0, 40) : [],
    category: micro.category || null,
    // Streaming eligibility (e.g. UNPLAYABLE without a browser session) is
    // not existence — only a hard ERROR means the video is gone/private.
    playable: status !== 'ERROR',
  };
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getVideoInfo(videoId) {
  if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return { ok: false, code: 'UNKNOWN', message: '올바른 YouTube 영상 ID가 아닙니다.' };
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
    if (!res.ok) return { ok: false, code: 'NETWORK', message: 'YouTube 영상 정보를 가져오지 못했습니다.' };
    const info = infoFromPlayerResponse(videoId, await res.json());
    if (!info) return { ok: false, code: 'EMPTY_RESPONSE', message: '재생할 수 없거나 존재하지 않는 영상입니다.' };
    return { ok: true, info };
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: err && err.name === 'AbortError' ? '응답 시간이 너무 오래 걸려 중단했습니다.' : '네트워크 오류로 YouTube에 연결할 수 없습니다.' };
  }
}

module.exports = { searchYoutube, getVideoInfo, infoFromPlayerResponse };
