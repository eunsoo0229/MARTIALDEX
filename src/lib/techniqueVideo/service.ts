import type { CuratedVideo, Technique } from '../../types';
import { techniqueVideoPickRepository } from './repository';
import type { TechniqueVideoPick } from './types';
import { canonicalTechniqueId, equivalentTechniqueIds } from '../techniqueCanonical';

/** Per-technique cap across base (curated/add_teq) + the user's own added videos. */
export const MAX_RELATED_VIDEOS = 5;

/** RelatedVideos.tsx's overlay read — returns the user's own pick for this technique, or undefined if they haven't chosen one. Never falls back to `technique.videos` itself (the caller already has that). */
export function getTechniqueVideoPick(techniqueId: string): TechniqueVideoPick | undefined {
  // Videos the user added to any record later merged into this canonical
  // technique all still show (canonical id's own pick first).
  const ids = equivalentTechniqueIds(techniqueId);
  const picks = [canonicalTechniqueId(techniqueId), ...ids].map((id) => techniqueVideoPickRepository.get(id)).filter((p): p is TechniqueVideoPick => !!p);
  if (picks.length <= 1) return picks[0];
  const seen = new Set<string>();
  const videos = picks.flatMap((p) => p.videos).filter((v) => (seen.has(v.videoId) ? false : (seen.add(v.videoId), true)));
  return { ...picks[0], videos };
}

/** Called once the user confirms a video from the search-and-pick UI (spec section 7's persistence requirement) — additive, never touches the technique's own base `videos` field. */
export function saveTechniqueVideoPick(techniqueId: string, videos: CuratedVideo[]): TechniqueVideoPick {
  const pick: TechniqueVideoPick = { techniqueId, videos, source: 'user_selected', updatedAt: new Date().toISOString() };
  techniqueVideoPickRepository.save(pick);
  return pick;
}

export function clearTechniqueVideoPick(techniqueId: string): void {
  techniqueVideoPickRepository.delete(techniqueId);
}

/**
 * The single merged list every screen should show: the technique's own base
 * videos first (curated/add_teq — never modified), then the user's added
 * ones, de-duplicated by videoId and capped at MAX_RELATED_VIDEOS. Existing
 * single-video picks keep showing exactly as before (they were only ever
 * saved for techniques with no base video, so nothing is displaced).
 */
export function getTechniqueVideos(technique: Pick<Technique, 'id' | 'videos'>): CuratedVideo[] {
  const seen = new Set<string>();
  const merged: CuratedVideo[] = [];
  for (const v of [...(technique.videos ?? []), ...(getTechniqueVideoPick(technique.id)?.videos ?? [])]) {
    if (!v?.videoId || seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    merged.push(v);
  }
  return merged.slice(0, MAX_RELATED_VIDEOS);
}

export function isUserAddedVideo(techniqueId: string, videoId: string): boolean {
  return !!getTechniqueVideoPick(techniqueId)?.videos.some((v) => v.videoId === videoId);
}

export type AddVideoResult = { ok: true; videos: CuratedVideo[] } | { ok: false; code: 'LIMIT' | 'DUPLICATE' | 'INVALID'; message: string };

export const LIMIT_MESSAGE = `최대 ${MAX_RELATED_VIDEOS}개의 관련 영상까지 등록할 수 있습니다.`;

/** Appends one video (never replaces). Enforces the 5-video cap and videoId de-duplication against the MERGED list (base + user). */
export function addTechniqueVideo(technique: Pick<Technique, 'id' | 'videos'>, video: CuratedVideo): AddVideoResult {
  if (!video?.videoId || !/^[A-Za-z0-9_-]{11}$/.test(video.videoId)) return { ok: false, code: 'INVALID', message: '올바른 YouTube 영상이 아닙니다.' };
  const current = getTechniqueVideos(technique);
  if (current.some((v) => v.videoId === video.videoId)) return { ok: false, code: 'DUPLICATE', message: '이미 등록된 영상입니다.' };
  if (current.length >= MAX_RELATED_VIDEOS) return { ok: false, code: 'LIMIT', message: LIMIT_MESSAGE };
  const existingUser = getTechniqueVideoPick(technique.id)?.videos ?? [];
  saveTechniqueVideoPick(canonicalTechniqueId(technique.id), [...existingUser, { title: video.title, videoId: video.videoId, channel: video.channel }]);
  return { ok: true, videos: getTechniqueVideos(technique) };
}

/** Removes only a video THIS user added — base curated/add_teq videos can't be removed from here. */
export function removeTechniqueVideo(techniqueId: string, videoId: string): void {
  for (const id of equivalentTechniqueIds(techniqueId)) {
    const pick = techniqueVideoPickRepository.get(id);
    if (!pick || !pick.videos.some((v) => v.videoId === videoId)) continue;
    const remaining = pick.videos.filter((v) => v.videoId !== videoId);
    if (remaining.length === 0) clearTechniqueVideoPick(id);
    else saveTechniqueVideoPick(id, remaining);
  }
}
