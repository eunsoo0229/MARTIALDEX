
// 다른 플랫폼 영상 — the fallback when the YouTube search finds no lesson video.
// The existing live web search (Tavily — no AI involved) looks for the lesson
// topic, and ONLY results that are real video pages on a known video platform
// are kept (Vimeo, Dailymotion, 네이버TV, TikTok, Bilibili, Instagram,
// Facebook, and YouTube links the web search turns up). Each one must name a
// lesson term (technique / topic word) in its REAL page title or text — a
// result is never shown on the strength of the search query alone. Platforms
// that allow it are played inside the app; the rest open in a new window.

export type VideoPlatform = 'youtube' | 'vimeo' | 'dailymotion' | 'naver' | 'tiktok' | 'bilibili' | 'instagram' | 'facebook';

export const PLATFORM_LABEL: Record<VideoPlatform, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  naver: '네이버TV',
  tiktok: 'TikTok',
  bilibili: 'Bilibili',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

export interface PlatformVideo {
  platform: VideoPlatform;
  /** The video page itself. */
  url: string;
  /** In-app player address; null = the platform doesn't allow embedding → open in a new window. */
  embedUrl: string | null;
  title: string;
  /** Why it was kept: the lesson term its real page text names. */
  reason: string;
}

/** Recognizes a video PAGE on a known platform (not a channel / search / profile page). */
export function parseVideoUrl(raw: string): { platform: VideoPlatform; id: string; embedUrl: string | null } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|mobile)\./, '');
  const path = u.pathname;
  let m: RegExpMatchArray | null;
  if (host === 'youtube.com' && path === '/watch' && u.searchParams.get('v')) {
    const id = u.searchParams.get('v')!;
    return /^[\w-]{11}$/.test(id) ? { platform: 'youtube', id, embedUrl: `https://www.youtube.com/embed/${id}` } : null;
  }
  if (host === 'youtube.com' && (m = path.match(/^\/shorts\/([\w-]{11})/))) return { platform: 'youtube', id: m[1], embedUrl: `https://www.youtube.com/embed/${m[1]}` };
  if (host === 'youtu.be' && (m = path.match(/^\/([\w-]{11})/))) return { platform: 'youtube', id: m[1], embedUrl: `https://www.youtube.com/embed/${m[1]}` };
  if (host === 'vimeo.com' && (m = path.match(/^\/(?:channels\/[\w-]+\/)?(\d{6,})/))) return { platform: 'vimeo', id: m[1], embedUrl: `https://player.vimeo.com/video/${m[1]}` };
  if (host === 'dailymotion.com' && (m = path.match(/^\/video\/([a-z0-9]+)/i))) return { platform: 'dailymotion', id: m[1], embedUrl: `https://geo.dailymotion.com/player.html?video=${m[1]}` };
  if (host === 'dai.ly' && (m = path.match(/^\/([a-z0-9]+)/i))) return { platform: 'dailymotion', id: m[1], embedUrl: `https://geo.dailymotion.com/player.html?video=${m[1]}` };
  if (host === 'tv.naver.com' && (m = path.match(/^\/(?:v|h)\/(\d+)/))) return { platform: 'naver', id: m[1], embedUrl: null }; // its in-app player couldn't be verified → opens in a new window
  if (host === 'tiktok.com' && (m = path.match(/^\/@[\w.-]+\/video\/(\d+)/))) return { platform: 'tiktok', id: m[1], embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}` };
  if (host === 'bilibili.com' && (m = path.match(/^\/video\/(BV[\w]+)/))) return { platform: 'bilibili', id: m[1], embedUrl: `https://player.bilibili.com/player.html?bvid=${m[1]}&autoplay=0` };
  if (host === 'instagram.com' && (m = path.match(/^\/(?:reel|reels|p|tv)\/([\w-]+)/))) return { platform: 'instagram', id: m[1], embedUrl: null };
  if ((host === 'facebook.com' || host === 'fb.watch') && /\/videos?\/|\/watch|^\/reel\//.test(path + u.search)) return { platform: 'facebook', id: path + u.search, embedUrl: null };
  return null;
}

/** Hosts the in-app player may load (must match index.html's CSP frame-src). */
export const EMBED_HOSTS = ['https://www.youtube.com', 'https://player.vimeo.com', 'https://geo.dailymotion.com', 'https://www.tiktok.com', 'https://player.bilibili.com'];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

/** The lesson term a result's REAL title/text names (null = none → not shown). */
export function termEvidence(text: string, terms: string[]): string | null {
  const t = norm(text);
  const usable = [...new Set(terms.map((x) => x.trim()).filter((x) => x.length >= 2))].sort((a, b) => b.length - a.length);
  return usable.find((term) => t.includes(norm(term))) ?? null;
}

export async function findOtherPlatformVideos(input: {
  /** Words a video must really be about (technique names / aliases / topic words). */
  terms: string[];
  /** What to search for (technique name + art, the lesson topic …). */
  queries: string[];
  want?: number;
  onProgress?: (msg: string) => void;
}): Promise<{ videos: PlatformVideo[]; queries: string[]; error?: string }> {
  const want = input.want ?? 3;
  const base = [...new Set(input.queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 2);
  const queries = base.flatMap((q) => [`${q} 영상`, `${q} video tutorial vimeo dailymotion`]);
  if (!queries.length) return { videos: [], queries };
  input.onProgress?.('유튜브에서 찾지 못해 다른 영상 플랫폼에서 찾는 중입니다…');
  // loaded only when a search really runs — the URL/evidence helpers above stay importable anywhere (tests, no Supabase env)
  const { runExpandedWebResearch } = await import('../webSearch/expandedSearch');
  const r = await runExpandedWebResearch([queries]);
  if (!r.ok) return { videos: [], queries: r.executedQueries.length ? r.executedQueries : queries, error: r.notConfigured ? '실시간 검색이 설정되어 있지 않아 다른 플랫폼에서 찾지 못했습니다.' : r.errorMessage ?? '다른 플랫폼 검색에 실패했습니다.' };
  const seen = new Set<string>();
  const videos: PlatformVideo[] = [];
  for (const item of r.collected) {
    if (videos.length >= want) break;
    const v = parseVideoUrl(item.url);
    if (!v) continue;
    const key = `${v.platform}:${v.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = termEvidence(`${item.title} ${item.snippet ?? ''} ${(item.content ?? '').slice(0, 2000)}`, input.terms);
    if (!hit) continue;
    videos.push({ platform: v.platform, url: item.url, embedUrl: v.embedUrl, title: item.title || PLATFORM_LABEL[v.platform], reason: `페이지 제목·설명에 "${hit}" 언급` });
  }
  return { videos, queries: r.executedQueries };
}
