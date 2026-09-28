import type { CuratedVideo } from '../../types';
import { techniqueVideoPickRepository } from './repository';
import type { TechniqueVideoPick } from './types';

/** RelatedVideos.tsx's overlay read — returns the user's own pick for this technique, or undefined if they haven't chosen one. Never falls back to `technique.videos` itself (the caller already has that). */
export function getTechniqueVideoPick(techniqueId: string): TechniqueVideoPick | undefined {
  return techniqueVideoPickRepository.get(techniqueId);
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
