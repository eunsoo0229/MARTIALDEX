import type { CuratedVideo, Technique } from '../../types';
import { getMartialArt } from '../loadData';
import { buildYoutubeQuery } from '../youtube';
import { videoSearchProvider } from '../videoSearch/provider';
import { getTechniqueVideos } from './service';
import { verifyTechniqueVideoUrl, type VideoVerificationResult } from './urlVerification';

// AI 튜터 수업의 영상 찾기 — reuses what already exists, in this order:
//   1. the technique's own videos (curated + the user's added ones),
//   2. YouTube search (videoSearchProvider — Electron / Edge Function /
//      Android paths) with several queries: the usual "art + name +
//      tutorial", then name variants (English name, aliases, Korean name),
//   3. every candidate goes through the SAME verification as "YouTube URL
//      직접 추가" (real video metadata → Gemini → code-level evidence checks).
//      Only a VERIFIED video is shown; a title match alone is never enough.
// Result cached per technique (a found video for a week, "none" for a day)
// so the lesson doesn't re-verify on every visit.

export interface TutorVideo {
  video: CuratedVideo;
  source: 'saved' | 'verified';
  reason?: string;
}
export interface TutorVideoResult {
  videos: TutorVideo[];
  /** How many search candidates were actually verified (0 when saved videos existed). */
  checked: number;
  queries: string[];
  error?: string;
}

const CACHE_PREFIX = 'mdx:tutor-video:';
const FOUND_TTL = 7 * 86400000;
const NONE_TTL = 86400000;

function readCache(id: string): { at: number; video: CuratedVideo | null; reason?: string } | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(id: string, video: CuratedVideo | null, reason?: string) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ at: Date.now(), video, reason }));
  } catch {
    // cache only
  }
}

export function searchQueriesFor(t: Technique): string[] {
  const art = getMartialArt(t.martialArt);
  const artEn = art?.nameEn ?? '';
  const q = [
    buildYoutubeQuery(t, art),
    `${t.name} tutorial`,
    `how to ${t.name}`,
    ...t.aliases.slice(0, 2).map((a) => `${a} tutorial`),
    t.koreanName && t.koreanName !== t.name ? `${t.koreanName} 방법` : '',
    artEn ? `${artEn} ${t.name} technique` : '',
  ];
  return [...new Set(q.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

export async function findTutorVideos(t: Technique, opts: { maxVerify?: number; onProgress?: (msg: string) => void } = {}): Promise<TutorVideoResult> {
  const saved = getTechniqueVideos(t);
  if (saved.length) return { videos: saved.map((v) => ({ video: v, source: 'saved' })), checked: 0, queries: [] };
  const cached = readCache(t.id);
  if (cached && Date.now() - cached.at < (cached.video ? FOUND_TTL : NONE_TTL)) {
    return { videos: cached.video ? [{ video: cached.video, source: 'verified', reason: cached.reason }] : [], checked: 0, queries: [] };
  }
  const maxVerify = opts.maxVerify ?? 4;
  const queries = searchQueriesFor(t);
  const seen = new Set<string>();
  let checked = 0;
  let lastError: string | undefined;
  for (const query of queries) {
    if (checked >= maxVerify) break;
    opts.onProgress?.(`"${query}"로 영상을 찾는 중입니다…`);
    const found = await videoSearchProvider.search(query);
    if (!found.ok) {
      lastError = found.message;
      continue;
    }
    for (const item of found.results.slice(0, 4)) {
      if (checked >= maxVerify) break;
      if (seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      checked++;
      opts.onProgress?.(`후보 영상 ${checked}개째의 내용이 이 기술과 맞는지 확인하는 중입니다…`);
      let v: VideoVerificationResult;
      try {
        v = await verifyTechniqueVideoUrl(t, item.videoId);
      } catch {
        continue;
      }
      if (v.verdict === 'VERIFIED' && v.videoId) {
        const video: CuratedVideo = { title: v.info?.title ?? item.title, videoId: v.videoId, channel: v.info?.channel ?? item.channel };
        writeCache(t.id, video, v.reason);
        return { videos: [{ video, source: 'verified', reason: v.reason }], checked, queries };
      }
    }
  }
  if (checked > 0) writeCache(t.id, null);
  return { videos: [], checked, queries, error: checked === 0 ? lastError : undefined };
}
